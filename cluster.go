package main

import (
	"fmt"
	"net"
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
	Subnet string // pod CIDR, empty for server/jumpbox
}

// Cluster holds all state for a KTHW deployment.
// The Jumpbox is the admin machine — all cluster operations flow through it.
type Cluster struct {
	WorkDir    string
	JumpboxDir string // working directory on the jumpbox VM (/root/kubernetes-the-hard-way)
	Jumpbox    Machine
	Server     Machine
	Nodes      []Machine
	Machines   []Machine // all 4 VMs
}

func NewCluster(workDir string) *Cluster {
	jumpbox := Machine{Name: "jumpbox", FQDN: "jumpbox.kubernetes.local"}
	server := Machine{Name: "server", FQDN: "server.kubernetes.local"}
	node0 := Machine{Name: "node-0", FQDN: "node-0.kubernetes.local", Subnet: "10.200.0.0/24"}
	node1 := Machine{Name: "node-1", FQDN: "node-1.kubernetes.local", Subnet: "10.200.1.0/24"}
	return &Cluster{
		WorkDir:    workDir,
		JumpboxDir: "/root/kubernetes-the-hard-way",
		Jumpbox:    jumpbox,
		Server:     server,
		Nodes:      []Machine{node0, node1},
		Machines:   []Machine{jumpbox, server, node0, node1},
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

func limaGuestArch() (arch, imageURL string) {
	if runtime.GOARCH == "amd64" {
		return "x86_64", "https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img"
	}
	return "aarch64", "https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-arm64.img"
}

func limaYAML(m Machine) string {
	vmType := limaVMType()
	netBlock := "networks:\n  - lima: shared"
	if runtime.GOOS == "linux" {
		netBlock = "networks:\n  - lima: user-v2"
	}
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

	// Pre-cleanup: remove any leftover instances with these names
	for _, m := range c.Machines {
		if limaInstanceExists(m.Name) {
			output("limactl", "stop", "--force", m.Name)
			output("limactl", "delete", m.Name)
		}
	}

	// Write all configs
	for _, m := range c.Machines {
		cfgPath := filepath.Join(c.WorkDir, m.Name+".yaml")
		if err := os.WriteFile(cfgPath, []byte(limaYAML(m)), 0644); err != nil {
			return fmt.Errorf("write lima config for %s: %w", m.Name, err)
		}
	}

	// Create and start all VMs in parallel
	type vmResult struct {
		name string
		err  error
	}
	ch := make(chan vmResult, len(c.Machines))
	for _, m := range c.Machines {
		go func(m Machine) {
			cfgPath := filepath.Join(c.WorkDir, m.Name+".yaml")
			if out, err := output("limactl", "create", "--name="+m.Name, "--tty=false", cfgPath); err != nil {
				ch <- vmResult{m.Name, fmt.Errorf("create %s: %w\n%s", m.Name, err, out)}
				return
			}
			if out, err := output("limactl", "start", m.Name); err != nil {
				ch <- vmResult{m.Name, fmt.Errorf("start %s: %w\n%s", m.Name, err, out)}
				return
			}
			fmt.Printf("    ✓ %s\n", m.Name)
			ch <- vmResult{m.Name, nil}
		}(m)
	}

	var errs []string
	for range c.Machines {
		r := <-ch
		if r.err != nil {
			errs = append(errs, r.err.Error())
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("VM creation failed:\n%s", strings.Join(errs, "\n"))
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

func cleanConflictingVMs(clusterNames []string) {
	virsh, err := exec.LookPath("virsh")
	if err != nil {
		return
	}

	out, err := output(virsh, "list", "--all", "--name")
	if err != nil {
		return
	}

	targets := make(map[string]bool, len(clusterNames))
	for _, n := range clusterNames {
		targets[n] = true
	}

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

// DiscoverIPs populates the IP field for each machine.
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
	c.Jumpbox = c.Machines[0]
	c.Server = c.Machines[1]
	c.Nodes = c.Machines[2:]
	return nil
}

func pickVMIP(addrs []string) string {
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
	ip := net.ParseIP(s)
	return ip != nil && ip.To4() != nil && ip.IsPrivate()
}

// --- Networking: /etc/hosts + SSH ---

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

// SetupSSHKeys generates an SSH keypair on the jumpbox and distributes the
// public key to all other machines so the jumpbox can SSH into them as root.
func (c *Cluster) SetupSSHKeys() error {
	// Generate keypair on jumpbox
	if _, err := c.Exec(c.Jumpbox.Name, "bash", "-c",
		`ssh-keygen -t ed25519 -f /root/.ssh/id_ed25519 -N "" -q`); err != nil {
		return fmt.Errorf("ssh-keygen on jumpbox: %w", err)
	}

	pubKey, err := c.Exec(c.Jumpbox.Name, "cat", "/root/.ssh/id_ed25519.pub")
	if err != nil {
		return fmt.Errorf("read jumpbox pubkey: %w", err)
	}
	pubKey = strings.TrimSpace(pubKey)

	// Distribute to server and worker nodes
	targets := append([]Machine{c.Server}, c.Nodes...)
	for _, m := range targets {
		cmd := fmt.Sprintf(
			`mkdir -p /root/.ssh && chmod 700 /root/.ssh && echo '%s' >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys`,
			pubKey)
		if _, err := c.Exec(m.Name, "bash", "-c", cmd); err != nil {
			return fmt.Errorf("distribute SSH key to %s: %w", m.Name, err)
		}
	}

	// Verify connectivity: jumpbox → each target
	for _, m := range targets {
		if _, err := c.SSH(m.Name, "hostname"); err != nil {
			return fmt.Errorf("jumpbox cannot SSH to %s: %w", m.Name, err)
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

// --- Jumpbox setup ---

// SetupJumpbox installs CLI tools on the jumpbox and creates the working directory.
func (c *Cluster) SetupJumpbox() error {
	jb := c.Jumpbox.Name

	if _, err := c.Exec(jb, "bash", "-c",
		"apt-get update -qq && apt-get -y -qq install wget curl vim openssl git"); err != nil {
		return fmt.Errorf("install tools on jumpbox: %w", err)
	}

	if _, err := c.Exec(jb, "mkdir", "-p", c.JumpboxDir); err != nil {
		return err
	}

	return nil
}

// StageOnJumpbox copies a local file from the host work directory to the
// jumpbox working directory, preserving the filename.
func (c *Cluster) StageOnJumpbox(localPath string) error {
	remotePath := c.JumpboxDir + "/" + filepath.Base(localPath)
	return c.CopyToVM(c.Jumpbox.Name, localPath, remotePath)
}

// InstallKubectlOnJumpbox copies kubectl from the downloads directory to /usr/local/bin/.
func (c *Cluster) InstallKubectlOnJumpbox() error {
	kubectlSrc := c.JumpboxDir + "/downloads/client/kubectl"
	_, err := c.Exec(c.Jumpbox.Name, "bash", "-c",
		fmt.Sprintf("cp %s /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl", kubectlSrc))
	return err
}

// VerifyJumpbox confirms tools are installed and binaries are present.
func (c *Cluster) VerifyJumpbox() (string, error) {
	version, err := c.Exec(c.Jumpbox.Name, "kubectl", "version", "--client", "--short")
	if err != nil {
		// --short may not be supported; try without
		version, err = c.Exec(c.Jumpbox.Name, "kubectl", "version", "--client")
		if err != nil {
			return "", fmt.Errorf("kubectl not working on jumpbox: %w", err)
		}
	}

	var lines []string
	lines = append(lines, "kubectl: "+strings.TrimSpace(version))

	lsOut, _ := c.Exec(c.Jumpbox.Name, "ls", c.JumpboxDir+"/downloads/")
	lines = append(lines, "downloads: "+strings.TrimSpace(strings.ReplaceAll(lsOut, "\n", ", ")))

	return strings.Join(lines, "\n"), nil
}

// --- Jumpbox-mediated execution ---

// SSH runs a command on a target VM from the jumpbox via SSH.
// This is how all provisioning commands flow after the jumpbox is set up.
func (c *Cluster) SSH(target string, args ...string) (string, error) {
	sshArgs := fmt.Sprintf("ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@%s -- %s",
		target, shellQuoteArgs(args))
	var out string
	err := retry(3, 2*time.Second, func() error {
		var e error
		out, e = c.Exec(c.Jumpbox.Name, "bash", "-c", sshArgs)
		return e
	})
	return out, err
}

// SCPToVM copies files from the jumpbox to a target VM via SCP.
func (c *Cluster) SCPToVM(target string, jumpboxPaths []string, remoteDest string) error {
	srcs := strings.Join(jumpboxPaths, " ")
	cmd := fmt.Sprintf("scp -o StrictHostKeyChecking=no -o ConnectTimeout=10 %s root@%s:%s",
		srcs, target, remoteDest)
	return retry(3, 2*time.Second, func() error {
		out, err := c.Exec(c.Jumpbox.Name, "bash", "-c", cmd)
		if err != nil {
			return fmt.Errorf("scp to %s: %w (output: %s)", target, err, strings.TrimSpace(out))
		}
		return nil
	})
}

// shellQuoteArgs joins arguments for shell execution, quoting args that contain spaces.
func shellQuoteArgs(args []string) string {
	var parts []string
	for _, a := range args {
		if strings.ContainsAny(a, " \t'\"\\|&;$(){}") {
			parts = append(parts, fmt.Sprintf("'%s'", strings.ReplaceAll(a, "'", "'\\''")))
		} else {
			parts = append(parts, a)
		}
	}
	return strings.Join(parts, " ")
}

// --- kubectl remote access ---

// ConfigureKubectl sets up kubectl on the jumpbox for remote cluster access,
// mirroring KTHW step 10. The admin kubeconfig is already on the jumpbox
// from step 5; this writes ~/.kube/config so kubectl works without flags.
func (c *Cluster) ConfigureKubectl() error {
	jb := c.Jumpbox.Name
	kcPath := c.JumpboxDir + "/admin.kubeconfig"

	if _, err := c.Exec(jb, "mkdir", "-p", "/root/.kube"); err != nil {
		return err
	}
	if _, err := c.Exec(jb, "cp", kcPath, "/root/.kube/config"); err != nil {
		return err
	}
	return nil
}

// VerifyKubectl confirms kubectl works from the jumpbox without --kubeconfig.
func (c *Cluster) VerifyKubectl() (string, error) {
	jb := c.Jumpbox.Name
	var lines []string

	version, err := c.Exec(jb, "kubectl", "version")
	if err != nil {
		return "", fmt.Errorf("kubectl version: %w", err)
	}
	lines = append(lines, strings.TrimSpace(version))

	nodes, err := c.Exec(jb, "kubectl", "get", "nodes")
	if err != nil {
		return "", fmt.Errorf("kubectl get nodes: %w", err)
	}
	lines = append(lines, strings.TrimSpace(nodes))

	return strings.Join(lines, "\n"), nil
}

// --- Direct host-to-VM execution (used for initial setup) ---

// Exec runs a command inside a Lima VM as root and returns combined output.
func (c *Cluster) Exec(vm string, args ...string) (string, error) {
	cmdArgs := []string{"shell", vm, "sudo"}
	cmdArgs = append(cmdArgs, args...)
	return output("limactl", cmdArgs...)
}

// CopyToVM copies a local file into a VM at the specified destination.
func (c *Cluster) CopyToVM(vm, localPath, remotePath string) error {
	tmpDest := "/tmp/ktew-" + filepath.Base(localPath)
	if err := run("limactl", "copy", localPath, vm+":"+tmpDest); err != nil {
		return err
	}
	_, err := c.Exec(vm, "mv", tmpDest, remotePath)
	return err
}

// WaitForService polls a systemd service on a VM (via jumpbox SSH) until active.
func (c *Cluster) WaitForService(vm, service string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		out, err := c.SSH(vm, "systemctl", "is-active", service)
		if err == nil && strings.TrimSpace(out) == "active" {
			return nil
		}
		time.Sleep(2 * time.Second)
	}
	logs, _ := c.SSH(vm, "journalctl", "-u", service, "--no-pager", "-n", "20")
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
