package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Machine represents a single node in the cluster.
type Machine struct {
	Name   string
	FQDN   string
	IP     string
	Subnet string // pod CIDR, empty for server
}

// Cluster holds all state for a KTHW deployment.
type Cluster struct {
	WorkDir  string
	Machines []Machine
	Server   Machine
	Nodes    []Machine
}

func NewCluster(workDir string) *Cluster {
	server := Machine{Name: "server", FQDN: "server.kubernetes.local"}
	node0 := Machine{Name: "node-0", FQDN: "node-0.kubernetes.local", Subnet: "10.200.0.0/24"}
	node1 := Machine{Name: "node-1", FQDN: "node-1.kubernetes.local", Subnet: "10.200.1.0/24"}
	return &Cluster{
		WorkDir:  workDir,
		Server:   server,
		Nodes:    []Machine{node0, node1},
		Machines: []Machine{server, node0, node1},
	}
}

func (c *Cluster) AllNames() []string {
	names := make([]string, len(c.Machines))
	for i, m := range c.Machines {
		names[i] = m.Name
	}
	return names
}

// --- Lima VM lifecycle ---

func limaVMType() string {
	if runtime.GOOS == "linux" {
		return "qemu"
	}
	return "vz"
}

// limaGuestArch returns Lima's arch name and Ubuntu cloud image URL for the current host arch.
func limaGuestArch() (arch, imageURL string) {
	if runtime.GOARCH == "amd64" {
		return "x86_64", "https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img"
	}
	return "aarch64", "https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-arm64.img"
}

func limaYAML(m Machine) string {
	vmType := limaVMType()
	netBlock := "networks:\n  - lima: user-v2"
	arch, imageURL := limaGuestArch()
	return fmt.Sprintf(`vmType: %s
os: Linux
arch: %s
images:
  - location: %s
    arch: %s
cpus: 2
memory: 2GiB
disk: 20GiB
mounts: []
%s
provision:
  - mode: system
    script: |
      #!/bin/bash
      set -eu
      hostnamectl set-hostname %s
      sed -i "s/^127.0.1.1.*/127.0.1.1\t%s %s/" /etc/hosts || true
      sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
      systemctl restart sshd
`, vmType, arch, imageURL, arch, netBlock, m.Name, m.FQDN, m.Name)
}

func (c *Cluster) CreateVMs() error {
	cleanConflictingVMs(c.AllNames())

	for _, m := range c.Machines {
		// Nuke any stale Lima instance with the same name so re-runs just work.
		if limaInstanceExists(m.Name) {
			_ = run("limactl", "stop", "--force", m.Name)
			_ = run("limactl", "delete", m.Name)
		}

		cfgPath := filepath.Join(c.WorkDir, m.Name+".yaml")
		if err := os.WriteFile(cfgPath, []byte(limaYAML(m)), 0644); err != nil {
			return fmt.Errorf("write lima config for %s: %w", m.Name, err)
		}
		createArgs := []string{"create", "--name=" + m.Name, "--tty=false", cfgPath}
		if runtime.GOOS == "linux" && m.Name == "server" {
			createArgs = append(createArgs, "--port-forward=6443:6443")
		}
		if err := run("limactl", createArgs...); err != nil {
			return fmt.Errorf("create VM %s: %w", m.Name, err)
		}
		if err := run("limactl", "start", m.Name); err != nil {
			return fmt.Errorf("start VM %s: %w", m.Name, err)
		}
	}
	return nil
}

func limaInstanceExists(name string) bool {
	out, err := output("limactl", "list", "--json")
	if err != nil {
		return false
	}
	return strings.Contains(out, `"`+name+`"`)
}

func (c *Cluster) DestroyVMs() error {
	for _, m := range c.Machines {
		_ = run("limactl", "stop", "--force", m.Name)
		_ = run("limactl", "delete", m.Name)
	}
	return nil
}

// cleanConflictingVMs detects and removes non-Lima VMs (e.g. libvirt) whose names
// collide with the cluster we're about to create. Also catches "jumpbox" which the
// original KTHW tutorial creates but ktew doesn't.
func cleanConflictingVMs(clusterNames []string) {
	virsh, err := exec.LookPath("virsh")
	if err != nil {
		return
	}

	out, err := output(virsh, "list", "--all", "--name")
	if err != nil {
		return
	}

	targets := make(map[string]bool, len(clusterNames)+1)
	for _, n := range clusterNames {
		targets[n] = true
	}
	targets["jumpbox"] = true // known KTHW artifact

	for _, line := range strings.Split(out, "\n") {
		name := strings.TrimSpace(line)
		if name == "" || !targets[name] {
			continue
		}
		fmt.Printf("  ⚠ found conflicting libvirt VM %q — removing\n", name)
		_ = run(virsh, "destroy", name)
		_ = run(virsh, "undefine", name)
	}
}

// DiscoverIPs populates the IP field for each machine by querying inside each VM.
// Lima may assign different subnets (e.g. 192.168.105.x socket_vmnet, 192.168.106.x VZ).
// We pick the first private IPv4, preferring subnets Lima uses for the shared VM network
// so all VMs end up on the same logical network and can reach each other.
func (c *Cluster) DiscoverIPs() error {
	for i := range c.Machines {
		out, err := c.Exec(c.Machines[i].Name, "hostname", "-I")
		if err != nil {
			return fmt.Errorf("get IP for %s: %w", c.Machines[i].Name, err)
		}
		ip := pickVMIP(strings.Fields(strings.TrimSpace(out)))
		if ip == "" {
			return fmt.Errorf("no private IPv4 for VM %s (got: %s)", c.Machines[i].Name, out)
		}
		c.Machines[i].IP = ip
	}
	c.Server = c.Machines[0]
	c.Nodes = c.Machines[1:]
	return nil
}

// pickVMIP chooses one private IPv4 from the list. Prefers subnets Lima typically
// uses for the shared VM network (192.168.106.x, 192.168.105.x), then any 192.168.x,
// then other RFC1918 ranges, so VMs on the same host get consistent reachable IPs.
func pickVMIP(addrs []string) string {
	// Prefer Lima shared-style subnets so all VMs land on the same network
	for _, prefix := range []string{"192.168.106.", "192.168.105.", "192.168."} {
		for _, a := range addrs {
			a = strings.TrimSpace(a)
			if strings.HasPrefix(a, prefix) && isPrivateIPv4(a) {
				return a
			}
		}
	}
	for _, a := range addrs {
		a = strings.TrimSpace(a)
		if isPrivateIPv4(a) {
			return a
		}
	}
	return ""
}

func isPrivateIPv4(s string) bool {
	if strings.Contains(s, ":") {
		return false
	}
	return strings.HasPrefix(s, "10.") ||
		strings.HasPrefix(s, "172.16.") || strings.HasPrefix(s, "172.17.") ||
		strings.HasPrefix(s, "172.18.") || strings.HasPrefix(s, "172.19.") ||
		strings.HasPrefix(s, "172.20.") || strings.HasPrefix(s, "172.21.") ||
		strings.HasPrefix(s, "172.22.") || strings.HasPrefix(s, "172.23.") ||
		strings.HasPrefix(s, "172.24.") || strings.HasPrefix(s, "172.25.") ||
		strings.HasPrefix(s, "172.26.") || strings.HasPrefix(s, "172.27.") ||
		strings.HasPrefix(s, "172.28.") || strings.HasPrefix(s, "172.29.") ||
		strings.HasPrefix(s, "172.30.") || strings.HasPrefix(s, "172.31.") ||
		strings.HasPrefix(s, "192.168.")
}

// SetupHostEntries configures /etc/hosts on each VM so they can resolve each other.
func (c *Cluster) SetupHostEntries() error {
	var entries []string
	for _, m := range c.Machines {
		entries = append(entries, fmt.Sprintf("%s %s %s", m.IP, m.FQDN, m.Name))
	}
	block := "\n# Kubernetes The Hard Way\n" + strings.Join(entries, "\n") + "\n"
	for _, m := range c.Machines {
		if _, err := c.Exec(m.Name, "bash", "-c", fmt.Sprintf("echo '%s' >> /etc/hosts", block)); err != nil {
			return fmt.Errorf("hosts on %s: %w", m.Name, err)
		}
	}
	return nil
}

// VerifyVMs returns a status string for each VM.
func (c *Cluster) VerifyVMs() (string, error) {
	var lines []string
	for _, m := range c.Machines {
		hostname, err := c.Exec(m.Name, "hostname")
		if err != nil {
			return "", fmt.Errorf("verify %s: %w", m.Name, err)
		}
		lines = append(lines, fmt.Sprintf("%-8s %s  %s", m.Name, m.IP, strings.TrimSpace(hostname)))
	}
	return strings.Join(lines, "\n"), nil
}

// --- Command execution ---

// Exec runs a command inside a Lima VM as root and returns combined output.
func (c *Cluster) Exec(vm string, args ...string) (string, error) {
	cmdArgs := []string{"shell", vm, "sudo"}
	cmdArgs = append(cmdArgs, args...)
	return output("limactl", cmdArgs...)
}

// CopyToVM copies a local file into a VM at the specified destination.
// limactl copy runs as the unprivileged user, so we stage in /tmp then sudo mv.
func (c *Cluster) CopyToVM(vm, localPath, remotePath string) error {
	tmpDest := "/tmp/ktew-" + filepath.Base(localPath)
	if err := run("limactl", "copy", localPath, vm+":"+tmpDest); err != nil {
		return err
	}
	_, err := c.Exec(vm, "mv", tmpDest, remotePath)
	return err
}

// WaitForService polls a systemd service on a VM until it's active or timeout.
func (c *Cluster) WaitForService(vm, service string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		out, err := c.Exec(vm, "systemctl", "is-active", service)
		if err == nil && strings.TrimSpace(out) == "active" {
			return nil
		}
		time.Sleep(2 * time.Second)
	}
	logs, _ := c.Exec(vm, "journalctl", "-u", service, "--no-pager", "-n", "20")
	return fmt.Errorf("service %s on %s not active after %s\n%s", service, vm, timeout, logs)
}

// --- Shell helpers ---

func run(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func output(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	out, err := cmd.CombinedOutput()
	return string(out), err
}
