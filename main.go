package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
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
	os.Unsetenv("LIMA_HOME")
	os.Unsetenv("LIMA_INSTANCE")

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
  kthw up    [--work-dir=DIR]   Create cluster (4 VMs: jumpbox, server, node-0, node-1)
  kthw down  [--work-dir=DIR]   Destroy cluster

Dependencies (Lima, QEMU) are installed automatically if missing.
Supported: macOS or Linux, arm64 or amd64.
`)
}

func runUp(workDir string) {
	absDir, err := filepath.Abs(workDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve work dir: %v\n", err)
		os.Exit(1)
	}
	if err := os.MkdirAll(absDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "create work dir: %v\n", err)
		os.Exit(1)
	}
	cluster := NewCluster(absDir)
	reportPath := filepath.Join(absDir, "kthw-report.md")
	finalReportPath := "kthw-report.md"

	steps := defineSteps(cluster)
	totalSteps := len(steps) + 1 // +1 for cleanup
	report, err := NewReport(totalSteps, reportPath)
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
			fmt.Fprintf(os.Stderr, "\n  ✗ Step %d failed: %v\n", idx, doErr)
			failed = true
			break
		}

		evidence, verifyErr := step.Verify()
		dur = time.Since(start)
		if verifyErr != nil {
			report.Record(idx, step.Name, dur, evidence, verifyErr)
			fmt.Fprintf(os.Stderr, "\n  ✗ Step %d verification failed: %v\n", idx, verifyErr)
			failed = true
			break
		}

		report.Record(idx, step.Name, dur, evidence, nil)
	}

	// Step 13: Cleaning Up — always runs, even on failure
	cleanupIdx := totalSteps
	fmt.Printf("  # Step %d: Cleaning Up\n", cleanupIdx)
	cleanupStart := time.Now()
	cluster.DestroyVMs()
	cleanupDur := time.Since(cleanupStart)
	report.Record(cleanupIdx, "Cleaning Up", cleanupDur, "VMs destroyed, work directory removed", nil)
	report.Finalize()

	// Copy finalized report out, then destroy work dir and self
	if data, err := os.ReadFile(reportPath); err == nil {
		os.WriteFile(finalReportPath, data, 0644)
	}
	os.RemoveAll(absDir)
	self, _ := os.Executable()
	os.Remove(self)

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

// defineSteps returns steps 1–12, matching the original KTHW chapters exactly.
// Step 13 (Cleaning Up) is handled unconditionally after the loop in runUp().
func defineSteps(c *Cluster) []Step {
	var pki *PKI
	var certEvidence string

	return []Step{
		// 01 — Prerequisites
		{
			Name: "Prerequisites",
			Do: func() error {
				if err := preflight(); err != nil {
					return err
				}
				// Create all 4 VMs — the machines themselves are the prerequisite
				if err := c.CreateVMs(); err != nil {
					return err
				}
				return c.DiscoverIPs()
			},
			Verify: func() (string, error) {
				var lines []string
				lines = append(lines, fmt.Sprintf("OS: %s, Arch: %s", runtime.GOOS, runtime.GOARCH))
				if path, err := exec.LookPath("limactl"); err == nil {
					lines = append(lines, "limactl: "+path)
				}
				lines = append(lines, fmt.Sprintf("VMs: %d (jumpbox, server, node-0, node-1)", len(c.Machines)))
				for _, m := range c.Machines {
					lines = append(lines, fmt.Sprintf("  %-8s %s", m.Name, m.IP))
				}
				return strings.Join(lines, "\n"), nil
			},
		},
		// 02 — Set Up The Jumpbox
		{
			Name: "Set Up The Jumpbox",
			Do: func() error {
				if err := c.SetupJumpbox(); err != nil {
					return err
				}
				if err := DownloadOnJumpbox(c); err != nil {
					return err
				}
				return c.InstallKubectlOnJumpbox()
			},
			Verify: func() (string, error) { return c.VerifyJumpbox() },
		},
		// 03 — Provisioning Compute Resources
		{
			Name: "Provisioning Compute Resources",
			Do: func() error {
				if err := c.SetupHostEntries(); err != nil {
					return err
				}
				return c.SetupSSHKeys()
			},
			Verify: func() (string, error) { return c.VerifyVMs() },
		},
		// 04 — Provisioning a CA and Generating TLS Certificates
		{
			Name: "Provisioning a CA and Generating TLS Certificates",
			Do: func() error {
				nodeIPs := make(map[string]string, len(c.Nodes))
				for _, n := range c.Nodes {
					nodeIPs[n.Name] = n.IP
				}
				var err error
				pki, certEvidence, err = GenerateAll(c.WorkDir, c.Server.IP, nodeIPs)
				if err != nil {
					return err
				}
				// Stage all certs on jumpbox
				certFiles := []string{
					"ca.crt", "ca.key",
					"kube-api-server.crt", "kube-api-server.key",
					"service-accounts.crt", "service-accounts.key",
					"admin.crt", "admin.key",
					"node-0.crt", "node-0.key",
					"node-1.crt", "node-1.key",
					"kube-proxy.crt", "kube-proxy.key",
					"kube-scheduler.crt", "kube-scheduler.key",
					"kube-controller-manager.crt", "kube-controller-manager.key",
				}
				for _, f := range certFiles {
					if err := c.StageOnJumpbox(filepath.Join(c.WorkDir, f)); err != nil {
						return fmt.Errorf("stage %s on jumpbox: %w", f, err)
					}
				}
				// Distribute certs from jumpbox to server and workers
				return c.DistributeCerts()
			},
			Verify: func() (string, error) {
				if pki == nil {
					return "", fmt.Errorf("PKI not initialized")
				}
				return certEvidence, nil
			},
		},
		// 05 — Generating Kubernetes Configuration Files for Authentication
		{
			Name: "Generating Kubernetes Configuration Files for Authentication",
			Do: func() error {
				configs, err := AllKubeconfigs(pki, "https://server.kubernetes.local:6443")
				if err != nil {
					return err
				}
				if err := WriteKubeconfigs(c.WorkDir, configs); err != nil {
					return err
				}
				// Stage all kubeconfigs on jumpbox
				for name := range configs {
					if err := c.StageOnJumpbox(filepath.Join(c.WorkDir, name+".kubeconfig")); err != nil {
						return fmt.Errorf("stage %s.kubeconfig: %w", name, err)
					}
				}
				// Distribute from jumpbox to server and workers
				return c.DistributeKubeconfigs()
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
		// 06 — Generating the Data Encryption Config and Key
		{
			Name: "Generating the Data Encryption Config and Key",
			Do: func() error {
				_, err := GenEncryptionConfig(c.WorkDir)
				if err != nil {
					return err
				}
				if err := c.StageOnJumpbox(filepath.Join(c.WorkDir, "encryption-config.yaml")); err != nil {
					return err
				}
				return c.DistributeEncryptionConfig()
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
		// 07 — Bootstrapping the etcd Cluster
		{
			Name:   "Bootstrapping the etcd Cluster",
			Do:     func() error { return c.BootstrapEtcd() },
			Verify: func() (string, error) { return c.VerifyEtcd() },
		},
		// 08 — Bootstrapping the Kubernetes Control Plane
		{
			Name:   "Bootstrapping the Kubernetes Control Plane",
			Do:     func() error { return c.BootstrapControlPlane() },
			Verify: func() (string, error) { return c.VerifyControlPlane() },
		},
		// 09 — Bootstrapping the Kubernetes Worker Nodes
		{
			Name:   "Bootstrapping the Kubernetes Worker Nodes",
			Do:     func() error { return c.BootstrapAllWorkers() },
			Verify: func() (string, error) { return c.VerifyWorkers() },
		},
		// 10 — Configuring kubectl for Remote Access
		{
			Name:   "Configuring kubectl for Remote Access",
			Do:     func() error { return c.ConfigureKubectl() },
			Verify: func() (string, error) { return c.VerifyKubectl() },
		},
		// 11 — Provisioning Pod Network Routes
		{
			Name:   "Provisioning Pod Network Routes",
			Do:     func() error { return c.SetupPodRoutes() },
			Verify: func() (string, error) { return c.VerifyRoutes() },
		},
		// 12 — Smoke Test
		{
			Name:   "Smoke Test",
			Do:     func() error { return c.RunSmokeTest() },
			Verify: func() (string, error) { return c.VerifySmokeTest() },
		},
	}
}
