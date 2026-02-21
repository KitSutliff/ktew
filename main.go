package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Step defines an action + verification pair. Every step MUST have both.
type Step struct {
	Name   string
	Do     func() error
	Verify func() (evidence string, err error)
}

func main() {
	upCmd := flag.NewFlagSet("up", flag.ExitOnError)
	downCmd := flag.NewFlagSet("down", flag.ExitOnError)
	workDir := ""
	upCmd.StringVar(&workDir, "work-dir", "", "working directory for generated files (default: ./kthw-work)")
	downCmd.StringVar(&workDir, "work-dir", "", "working directory (default: ./kthw-work)")

	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "up":
		upCmd.Parse(os.Args[2:])
		if workDir == "" {
			workDir = "kthw-work"
		}
		runUp(workDir)
	case "down":
		downCmd.Parse(os.Args[2:])
		if workDir == "" {
			workDir = "kthw-work"
		}
		runDown(workDir)
	default:
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintf(os.Stderr, `kthw — Kubernetes The Hard Way, automated

Usage:
  kthw up    [--work-dir=DIR]   Create cluster
  kthw down  [--work-dir=DIR]   Destroy cluster

Dependencies (Lima, QEMU) are installed automatically if missing.
Supported: macOS or Linux, arm64 or amd64.
`)
}

func runUp(workDir string) {
	if err := preflight(); err != nil {
		fmt.Fprintf(os.Stderr, "preflight failed: %v\n", err)
		os.Exit(1)
	}

	absDir, _ := filepath.Abs(workDir)
	os.MkdirAll(absDir, 0755)
	cluster := NewCluster(absDir)
	reportPath := filepath.Join(absDir, "kthw-report.md")
	finalReportPath := "kthw-report.md"

	steps := defineSteps(cluster)
	report, err := NewReport(len(steps), reportPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "create report: %v\n", err)
		os.Exit(1)
	}

	failed := false
	runStart := time.Now()
	for i, step := range steps {
		idx := i + 1
		fmt.Printf("  # Step %d: %s\n", idx, step.Name)

		start := time.Now()
		doErr := step.Do()
		dur := time.Since(start)

		if doErr != nil {
			report.Record(idx, step.Name, dur, "", doErr)
			report.Finalize()
			fmt.Fprintf(os.Stderr, "\n  ✗ Step %d failed: %v\n", idx, doErr)
			failed = true
			break
		}

		evidence, verifyErr := step.Verify()
		dur = time.Since(start)
		if verifyErr != nil {
			report.Record(idx, step.Name, dur, evidence, verifyErr)
			report.Finalize()
			fmt.Fprintf(os.Stderr, "\n  ✗ Step %d verification failed: %v\n", idx, verifyErr)
			failed = true
			break
		}

		report.Record(idx, step.Name, dur, evidence, nil)
	}

	if !failed {
		report.Finalize()
	}

	// Copy report out of work dir before cleanup
	if data, err := os.ReadFile(reportPath); err == nil {
		os.WriteFile(finalReportPath, data, 0644)
	}

	fmt.Println()
	fmt.Println("  ────────────────────────────────────────")
	fmt.Println("  Cleaning up VMs...")
	cluster.DestroyVMs()
	os.RemoveAll(absDir)
	self, _ := os.Executable()
	os.Remove(self)
	fmt.Println("  done.")
	fmt.Println()

	elapsed := time.Since(runStart)

	if failed {
		fmt.Fprintf(os.Stderr, "  Report: %s\n", finalReportPath)
		os.Exit(1)
	}

	fmt.Printf("  time - %s\n", formatDuration(elapsed))
	fmt.Println()
	fmt.Println("  Congratul8ions!")
	fmt.Println()
	fmt.Printf("  report: %s\n", finalReportPath)
	fmt.Println()
}

func runDown(workDir string) {
	absDir, _ := filepath.Abs(workDir)
	cluster := NewCluster(absDir)
	fmt.Println("  Destroying VMs...")
	cluster.DestroyVMs()
	if err := os.RemoveAll(absDir); err != nil {
		fmt.Fprintf(os.Stderr, "  warning: could not remove %s: %v\n", absDir, err)
	} else {
		fmt.Printf("  Removed %s\n", absDir)
	}
	fmt.Println("  done.")
}

func preflight() error {
	switch runtime.GOOS {
	case "darwin", "linux":
	default:
		return fmt.Errorf("unsupported OS: %s (need darwin or linux)", runtime.GOOS)
	}
	switch runtime.GOARCH {
	case "arm64", "amd64":
	default:
		return fmt.Errorf("unsupported arch: %s (need arm64 or amd64)", runtime.GOARCH)
	}
	return ensureDeps()
}

func defineSteps(c *Cluster) []Step {
	var pki *PKI
	var certEvidence string

	return []Step{
		{
			Name: "Create VMs",
			Do: func() error {
				if err := c.CreateVMs(); err != nil {
					return err
				}
				if err := c.DiscoverIPs(); err != nil {
					return err
				}
				return c.SetupHostEntries()
			},
			Verify: func() (string, error) { return c.VerifyVMs() },
		},
		{
			Name: "Generate Certificates",
			Do: func() error {
				nodeIPs := make(map[string]string, len(c.Nodes))
				for _, n := range c.Nodes {
					nodeIPs[n.Name] = n.IP
				}
				var err error
				pki, certEvidence, err = GenerateAll(c.WorkDir, c.Server.IP, nodeIPs)
				return err
			},
			Verify: func() (string, error) {
				if pki == nil {
					return "", fmt.Errorf("PKI not initialized")
				}
				return certEvidence, nil
			},
		},
		{
			Name: "Generate Kubeconfigs",
			Do: func() error {
				configs, err := AllKubeconfigs(pki, "https://server.kubernetes.local:6443")
				if err != nil {
					return err
				}
				return WriteKubeconfigs(c.WorkDir, configs)
			},
			Verify: func() (string, error) {
				names := []string{"node-0", "node-1", "kube-proxy", "kube-controller-manager", "kube-scheduler", "admin"}
				var lines []string
				for _, n := range names {
					path := filepath.Join(c.WorkDir, n+".kubeconfig")
					info, err := os.Stat(path)
					if err != nil {
						return "", fmt.Errorf("missing %s.kubeconfig", n)
					}
					lines = append(lines, fmt.Sprintf("  %s.kubeconfig (%d bytes)", n, info.Size()))
				}
				return fmt.Sprintf("%d kubeconfigs generated:\n%s", len(names), strings.Join(lines, "\n")), nil
			},
		},
		{
			Name: "Generate Encryption Config",
			Do: func() error {
				_, err := GenEncryptionConfig(c.WorkDir)
				return err
			},
			Verify: func() (string, error) {
				path := filepath.Join(c.WorkDir, "encryption-config.yaml")
				info, err := os.Stat(path)
				if err != nil {
					return "", fmt.Errorf("missing encryption-config.yaml")
				}
				return fmt.Sprintf("encryption-config.yaml (%d bytes)", info.Size()), nil
			},
		},
		{
			Name: "Download Binaries",
			Do: func() error {
				_, err := DownloadAll(c.WorkDir)
				return err
			},
			Verify: func() (string, error) {
				var lines []string
				groups := []string{"controller", "worker", "client", "etcd", "containerd", "cni"}
				for _, g := range groups {
					dir := filepath.Join(c.WorkDir, "downloads", g)
					entries, err := os.ReadDir(dir)
					if err != nil {
						continue
					}
					var names []string
					for _, e := range entries {
						names = append(names, e.Name())
					}
					lines = append(lines, fmt.Sprintf("  %s: %s", g, strings.Join(names, ", ")))
				}
				return "Downloaded binaries:\n" + strings.Join(lines, "\n"), nil
			},
		},
		{
			Name:   "Bootstrap etcd",
			Do:     func() error { return c.BootstrapEtcd() },
			Verify: func() (string, error) { return c.VerifyEtcd() },
		},
		{
			Name:   "Bootstrap Control Plane",
			Do:     func() error { return c.BootstrapControlPlane() },
			Verify: func() (string, error) { return c.VerifyControlPlane() },
		},
		{
			Name:   "Bootstrap Workers",
			Do:     func() error { return c.BootstrapAllWorkers() },
			Verify: func() (string, error) { return c.VerifyWorkers() },
		},
		{
			Name:   "Configure Pod Network Routes",
			Do:     func() error { return c.SetupPodRoutes() },
			Verify: func() (string, error) { return c.VerifyRoutes() },
		},
		{
			Name:   "Smoke Test",
			Do:     func() error { return nil },
			Verify: func() (string, error) { return c.SmokeTest() },
		},
	}
}
