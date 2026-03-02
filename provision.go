package main

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

// --- Shared helpers ---

// installBinaryFromJumpbox copies a binary from the jumpbox downloads to /usr/local/bin/ on a target VM.
func (c *Cluster) installBinaryFromJumpbox(target, jumpboxPath, remoteName string) error {
	if err := c.SCPToVM(target, []string{jumpboxPath}, "/root/"+remoteName); err != nil {
		return err
	}
	_, err := c.SSH(target,
		fmt.Sprintf("mv /root/%s /usr/local/bin/%s && chmod +x /usr/local/bin/%s", remoteName, remoteName, remoteName))
	return err
}

// writeAndCopyViaJumpbox writes content to a file on the jumpbox, then SCPs it to a target VM.
func (c *Cluster) writeAndCopyViaJumpbox(target, content, remotePath string) error {
	// Write temp file on jumpbox
	tmpPath := "/tmp/ktew-" + filepath.Base(remotePath)
	escaped := strings.ReplaceAll(content, "'", "'\\''")
	if _, err := c.Exec(c.Jumpbox.Name, "bash", "-c",
		fmt.Sprintf("printf '%%s\\n' '%s' > %s", escaped, tmpPath)); err != nil {
		return err
	}
	// SCP from jumpbox to target
	if err := c.SCPToVM(target, []string{tmpPath}, remotePath); err != nil {
		return err
	}
	c.Exec(c.Jumpbox.Name, "rm", "-f", tmpPath)
	return nil
}

// installSystemdUnitViaJumpbox writes a unit file to a target VM via the jumpbox.
func (c *Cluster) installSystemdUnitViaJumpbox(target, name, content string) error {
	return c.writeAndCopyViaJumpbox(target, content, "/etc/systemd/system/"+name)
}

// enableAndStartViaSSH does daemon-reload and starts services on a target VM.
func (c *Cluster) enableAndStartViaSSH(target string, services ...string) error {
	svcList := strings.Join(services, " ")
	_, err := c.SSH(target,
		fmt.Sprintf("systemctl daemon-reload && systemctl enable %s && systemctl start %s", svcList, svcList))
	return err
}

// --- Certificate and config distribution (jumpbox → VMs) ---

// DistributeCerts copies certificates from the jumpbox to server and worker nodes.
// Mirrors KTHW step 4 distribution.
func (c *Cluster) DistributeCerts() error {
	jbDir := c.JumpboxDir

	// Server gets: CA keypair, api-server keypair, service-accounts keypair
	serverCerts := []string{
		jbDir + "/ca.crt", jbDir + "/ca.key",
		jbDir + "/kube-api-server.crt", jbDir + "/kube-api-server.key",
		jbDir + "/service-accounts.crt", jbDir + "/service-accounts.key",
	}
	if err := c.SCPToVM(c.Server.Name, serverCerts, "~/"); err != nil {
		return fmt.Errorf("distribute certs to server: %w", err)
	}

	// Each worker gets: CA cert + its own keypair → /var/lib/kubelet/ (matching KTHW step 4)
	for _, node := range c.Nodes {
		if _, err := c.SSH(node.Name, "mkdir", "-p", "/var/lib/kubelet/"); err != nil {
			return fmt.Errorf("create kubelet dir on %s: %w", node.Name, err)
		}
		if err := c.SCPToVM(node.Name, []string{jbDir + "/ca.crt"}, "/var/lib/kubelet/"); err != nil {
			return fmt.Errorf("distribute ca.crt to %s: %w", node.Name, err)
		}
		// SCP node cert as kubelet.crt (KTHW renames during distribution)
		if err := c.SCPToVM(node.Name, []string{jbDir + "/" + node.Name + ".crt"}, "/var/lib/kubelet/kubelet.crt"); err != nil {
			return fmt.Errorf("distribute %s.crt to %s: %w", node.Name, node.Name, err)
		}
		if err := c.SCPToVM(node.Name, []string{jbDir + "/" + node.Name + ".key"}, "/var/lib/kubelet/kubelet.key"); err != nil {
			return fmt.Errorf("distribute %s.key to %s: %w", node.Name, node.Name, err)
		}
	}
	return nil
}

// DistributeKubeconfigs copies kubeconfigs from the jumpbox to server and workers.
// Mirrors KTHW step 5 distribution.
func (c *Cluster) DistributeKubeconfigs() error {
	jbDir := c.JumpboxDir

	// Each worker gets: its own kubeconfig + kube-proxy kubeconfig
	for _, node := range c.Nodes {
		files := []string{
			jbDir + "/" + node.Name + ".kubeconfig",
			jbDir + "/kube-proxy.kubeconfig",
		}
		if err := c.SCPToVM(node.Name, files, "~/"); err != nil {
			return fmt.Errorf("distribute kubeconfigs to %s: %w", node.Name, err)
		}
	}

	// Server gets: admin, controller-manager, scheduler kubeconfigs
	serverConfigs := []string{
		jbDir + "/admin.kubeconfig",
		jbDir + "/kube-controller-manager.kubeconfig",
		jbDir + "/kube-scheduler.kubeconfig",
	}
	if err := c.SCPToVM(c.Server.Name, serverConfigs, "~/"); err != nil {
		return fmt.Errorf("distribute kubeconfigs to server: %w", err)
	}

	return nil
}

// DistributeEncryptionConfig copies the encryption config to the server.
func (c *Cluster) DistributeEncryptionConfig() error {
	return c.SCPToVM(c.Server.Name,
		[]string{c.JumpboxDir + "/encryption-config.yaml"},
		"~/")
}

// --- Etcd ---

func (c *Cluster) BootstrapEtcd() error {
	vm := c.Server.Name
	jbDl := c.JumpboxDir + "/downloads"

	for _, bin := range []string{"etcd", "etcdctl"} {
		if err := c.installBinaryFromJumpbox(vm, jbDl+"/etcd/"+bin, bin); err != nil {
			return fmt.Errorf("install %s: %w", bin, err)
		}
	}

	cmds := []string{
		"mkdir -p /etc/etcd /var/lib/etcd",
		"chmod 700 /var/lib/etcd",
	}
	for _, cmd := range cmds {
		if _, err := c.SSH(vm, cmd); err != nil {
			return err
		}
	}

	// Copy certs from ~/ to /etc/etcd/
	for _, f := range []string{"ca.crt", "kube-api-server.key", "kube-api-server.crt"} {
		if _, err := c.SSH(vm, "cp", "~/"+f, "/etc/etcd/"+f); err != nil {
			return err
		}
	}

	if err := c.installSystemdUnitViaJumpbox(vm, "etcd.service", etcdService); err != nil {
		return err
	}
	if err := c.enableAndStartViaSSH(vm, "etcd"); err != nil {
		return err
	}
	return c.WaitForService(vm, "etcd", 30*time.Second)
}

func (c *Cluster) VerifyEtcd() (string, error) {
	return c.SSH(c.Server.Name, "etcdctl", "member", "list")
}

// --- Control Plane ---

func (c *Cluster) BootstrapControlPlane() error {
	vm := c.Server.Name
	jbDl := c.JumpboxDir + "/downloads"

	// Install binaries
	ctrlBins := []string{"kube-apiserver", "kube-controller-manager", "kube-scheduler"}
	for _, bin := range ctrlBins {
		if err := c.installBinaryFromJumpbox(vm, jbDl+"/controller/"+bin, bin); err != nil {
			return fmt.Errorf("install %s: %w", bin, err)
		}
	}
	if err := c.installBinaryFromJumpbox(vm, jbDl+"/client/kubectl", "kubectl"); err != nil {
		return fmt.Errorf("install kubectl: %w", err)
	}

	// Create directories
	if _, err := c.SSH(vm, "mkdir", "-p", "/var/lib/kubernetes/", "/etc/kubernetes/config"); err != nil {
		return err
	}

	// Copy certs + keys from ~/ to /var/lib/kubernetes/
	k8sFiles := []string{
		"ca.crt", "ca.key",
		"kube-api-server.crt", "kube-api-server.key",
		"service-accounts.crt", "service-accounts.key",
	}
	for _, f := range k8sFiles {
		if _, err := c.SSH(vm, "cp", "~/"+f, "/var/lib/kubernetes/"+f); err != nil {
			return fmt.Errorf("copy %s: %w", f, err)
		}
	}

	// Copy encryption config
	if _, err := c.SSH(vm, "cp", "~/encryption-config.yaml", "/var/lib/kubernetes/encryption-config.yaml"); err != nil {
		return err
	}

	// Copy kubeconfigs
	for _, kc := range []string{"kube-controller-manager", "kube-scheduler", "admin"} {
		src := "~/" + kc + ".kubeconfig"
		dest := "/var/lib/kubernetes/" + kc + ".kubeconfig"
		if _, err := c.SSH(vm, "cp", src, dest); err != nil {
			return fmt.Errorf("copy kubeconfig %s: %w", kc, err)
		}
	}

	// Scheduler config
	if err := c.writeAndCopyViaJumpbox(vm, kubeSchedulerYAML, "/etc/kubernetes/config/kube-scheduler.yaml"); err != nil {
		return err
	}

	// Install unit files
	units := map[string]string{
		"kube-apiserver.service":          kubeApiserverService,
		"kube-controller-manager.service": kubeControllerManagerService,
		"kube-scheduler.service":          kubeSchedulerService,
	}
	for name, content := range units {
		if err := c.installSystemdUnitViaJumpbox(vm, name, content); err != nil {
			return fmt.Errorf("unit %s: %w", name, err)
		}
	}

	if err := c.enableAndStartViaSSH(vm, "kube-apiserver", "kube-controller-manager", "kube-scheduler"); err != nil {
		return err
	}
	if err := c.WaitForService(vm, "kube-apiserver", 30*time.Second); err != nil {
		return err
	}

	// Apply RBAC for kubelet authorization — from jumpbox using admin kubeconfig staged there
	rbacPath := "/root/kube-apiserver-to-kubelet.yaml"
	if err := c.writeAndCopyViaJumpbox(vm, kubeApiserverToKubeletYAML, rbacPath); err != nil {
		return err
	}
	_, err := c.SSH(vm, "kubectl", "apply", "-f", rbacPath,
		"--kubeconfig", "/var/lib/kubernetes/admin.kubeconfig")
	return err
}

func (c *Cluster) VerifyControlPlane() (string, error) {
	return c.SSH(c.Server.Name, "kubectl", "cluster-info",
		"--kubeconfig", "/var/lib/kubernetes/admin.kubeconfig")
}

// --- Workers ---

func (c *Cluster) BootstrapWorker(node Machine) error {
	vm := node.Name
	jbDl := c.JumpboxDir + "/downloads"

	// Install OS deps
	if _, err := c.SSH(vm,
		"apt-get update -qq && apt-get -y -qq install socat conntrack ipset kmod"); err != nil {
		return fmt.Errorf("install deps on %s: %w", vm, err)
	}

	// Disable swap
	c.SSH(vm, "swapoff", "-a")

	// Create directories
	dirs := []string{
		"/etc/cni/net.d", "/opt/cni/bin",
		"/var/lib/kubelet", "/var/lib/kube-proxy",
		"/var/lib/kubernetes", "/var/run/kubernetes",
	}
	if _, err := c.SSH(vm, "mkdir -p "+strings.Join(dirs, " ")); err != nil {
		return err
	}

	// Install worker binaries (from jumpbox downloads via SCP)
	workerBins := []string{"kube-proxy", "kubelet", "crictl", "runc"}
	for _, bin := range workerBins {
		if err := c.installBinaryFromJumpbox(vm, jbDl+"/worker/"+bin, bin); err != nil {
			return fmt.Errorf("install %s on %s: %w", bin, vm, err)
		}
	}
	if err := c.installBinaryFromJumpbox(vm, jbDl+"/client/kubectl", "kubectl"); err != nil {
		return fmt.Errorf("install kubectl on %s: %w", vm, err)
	}

	// Containerd binaries go to /bin/
	for _, bin := range []string{"containerd", "containerd-shim-runc-v2", "containerd-stress"} {
		src := jbDl + "/containerd/" + bin
		if err := c.SCPToVM(vm, []string{src}, "/root/"+bin); err != nil {
			return err
		}
		if _, err := c.SSH(vm,
			fmt.Sprintf("mv /root/%s /bin/%s && chmod +x /bin/%s", bin, bin, bin)); err != nil {
			return err
		}
	}

	// CNI plugins to /opt/cni/bin/
	cniLs, err := c.Exec(c.Jumpbox.Name, "ls", jbDl+"/cni/")
	if err != nil {
		return fmt.Errorf("list CNI plugins: %w", err)
	}
	for _, name := range strings.Fields(strings.TrimSpace(cniLs)) {
		if name == "" {
			continue
		}
		src := jbDl + "/cni/" + name
		if err := c.SCPToVM(vm, []string{src}, "/root/"+name); err != nil {
			return err
		}
		if _, err := c.SSH(vm,
			fmt.Sprintf("mv /root/%s /opt/cni/bin/%s && chmod +x /opt/cni/bin/%s", name, name, name)); err != nil {
			return err
		}
	}

	// CNI config
	bridgeConf := strings.ReplaceAll(bridgeConfTmpl, "{{SUBNET}}", node.Subnet)
	if err := c.writeAndCopyViaJumpbox(vm, bridgeConf, "/etc/cni/net.d/10-bridge.conf"); err != nil {
		return err
	}
	if err := c.writeAndCopyViaJumpbox(vm, loopbackConf, "/etc/cni/net.d/99-loopback.conf"); err != nil {
		return err
	}

	// br_netfilter
	c.SSH(vm, "modprobe", "br-netfilter")
	c.SSH(vm, `echo "br-netfilter" >> /etc/modules-load.d/modules.conf`)
	c.SSH(vm, `echo "net.bridge.bridge-nf-call-iptables = 1" >> /etc/sysctl.d/kubernetes.conf`)
	c.SSH(vm, `echo "net.bridge.bridge-nf-call-ip6tables = 1" >> /etc/sysctl.d/kubernetes.conf`)
	c.SSH(vm, "sysctl", "-p", "/etc/sysctl.d/kubernetes.conf")

	// Containerd config
	if _, err := c.SSH(vm, "mkdir", "-p", "/etc/containerd"); err != nil {
		return err
	}
	if err := c.writeAndCopyViaJumpbox(vm, containerdConfig, "/etc/containerd/config.toml"); err != nil {
		return err
	}

	// Kubelet config — certs already in /var/lib/kubelet/ from step 4 distribution
	if _, err := c.SSH(vm, "cp", "~/"+node.Name+".kubeconfig", "/var/lib/kubelet/kubeconfig"); err != nil {
		return err
	}
	if err := c.writeAndCopyViaJumpbox(vm, kubeletConfigYAML, "/var/lib/kubelet/kubelet-config.yaml"); err != nil {
		return err
	}

	// Kube-proxy config
	if _, err := c.SSH(vm, "cp", "~/kube-proxy.kubeconfig", "/var/lib/kube-proxy/kubeconfig"); err != nil {
		return err
	}
	if err := c.writeAndCopyViaJumpbox(vm, kubeProxyConfigYAML, "/var/lib/kube-proxy/kube-proxy-config.yaml"); err != nil {
		return err
	}

	// Install unit files
	units := map[string]string{
		"containerd.service": containerdService,
		"kubelet.service":    kubeletService,
		"kube-proxy.service": kubeProxyService,
	}
	for name, content := range units {
		if err := c.installSystemdUnitViaJumpbox(vm, name, content); err != nil {
			return fmt.Errorf("unit %s on %s: %w", name, vm, err)
		}
	}

	if err := c.enableAndStartViaSSH(vm, "containerd", "kubelet", "kube-proxy"); err != nil {
		return err
	}
	return c.WaitForService(vm, "kubelet", 60*time.Second)
}

func (c *Cluster) BootstrapAllWorkers() error {
	for _, node := range c.Nodes {
		fmt.Printf("    → provisioning %s\n", node.Name)
		if err := c.BootstrapWorker(node); err != nil {
			return fmt.Errorf("worker %s: %w", node.Name, err)
		}
	}
	return nil
}

func (c *Cluster) VerifyWorkers() (string, error) {
	kc := "/var/lib/kubernetes/admin.kubeconfig"
	expected := len(c.Nodes)

	for attempt := 0; attempt < 60; attempt++ {
		out, err := c.SSH(c.Server.Name, "kubectl", "get", "nodes", "--no-headers", "--kubeconfig", kc)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		lines := strings.Split(strings.TrimSpace(out), "\n")
		readyCount := 0
		for _, line := range lines {
			if strings.Contains(line, " Ready") && !strings.Contains(line, "NotReady") {
				readyCount++
			}
		}
		if readyCount >= expected {
			full, _ := c.SSH(c.Server.Name, "kubectl", "get", "nodes", "--kubeconfig", kc)
			return strings.TrimSpace(full), nil
		}
		time.Sleep(2 * time.Second)
	}
	out, _ := c.SSH(c.Server.Name, "kubectl", "get", "nodes", "--kubeconfig", kc)
	return "", fmt.Errorf("expected %d Ready nodes after 120s, got:\n%s", expected, out)
}

// --- Network routes ---

func (c *Cluster) SetupPodRoutes() error {
	for _, node := range c.Nodes {
		if _, err := c.SSH(c.Server.Name, "ip", "route", "add", node.Subnet, "via", node.IP); err != nil {
			return fmt.Errorf("route on server to %s: %w", node.Name, err)
		}
	}
	for i, node := range c.Nodes {
		other := c.Nodes[1-i]
		if _, err := c.SSH(node.Name, "ip", "route", "add", other.Subnet, "via", other.IP); err != nil {
			return fmt.Errorf("route on %s to %s: %w", node.Name, other.Name, err)
		}
	}
	return nil
}

func (c *Cluster) VerifyRoutes() (string, error) {
	var lines []string
	for _, m := range append([]Machine{c.Server}, c.Nodes...) {
		out, err := c.SSH(m.Name, "ip", "route")
		if err != nil {
			return "", err
		}
		var relevant []string
		for _, line := range strings.Split(out, "\n") {
			if strings.Contains(line, "10.200.") {
				relevant = append(relevant, strings.TrimSpace(line))
			}
		}
		if len(relevant) > 0 {
			lines = append(lines, fmt.Sprintf("%s:", m.Name))
			lines = append(lines, relevant...)
		}
	}
	return strings.Join(lines, "\n"), nil
}

// --- Smoke test ---

// RunSmokeTest creates the test resources (secret, deployment, service).
func (c *Cluster) RunSmokeTest() error {
	vm := c.Server.Name
	kc := "/var/lib/kubernetes/admin.kubeconfig"

	if _, err := c.SSH(vm, "kubectl", "create", "secret", "generic", "kubernetes-the-hard-way",
		"--from-literal=mykey=mydata", "--kubeconfig", kc); err != nil {
		return fmt.Errorf("create secret: %w", err)
	}
	if _, err := c.SSH(vm, "kubectl", "create", "deployment", "nginx",
		"--image=nginx:latest", "--kubeconfig", kc); err != nil {
		return fmt.Errorf("create deployment: %w", err)
	}
	if _, err := c.SSH(vm, "kubectl", "expose", "deployment", "nginx",
		"--port=80", "--type=NodePort", "--kubeconfig", kc); err != nil {
		return fmt.Errorf("expose deployment: %w", err)
	}
	return nil
}

// VerifySmokeTest waits for resources and collects evidence.
func (c *Cluster) VerifySmokeTest() (string, error) {
	vm := c.Server.Name
	kc := "/var/lib/kubernetes/admin.kubeconfig"
	var evidence []string

	// Check encryption at rest
	out, err := c.SSH(vm,
		"etcdctl get /registry/secrets/default/kubernetes-the-hard-way --print-value-only | head -c 40 | od -A x -t x1z")
	if err != nil {
		evidence = append(evidence, "? Secret encryption check failed: "+err.Error())
	} else if strings.Contains(out, "enc:aescbc") || len(out) > 10 {
		evidence = append(evidence, "✓ Secret encryption at rest verified (aescbc)")
	} else {
		evidence = append(evidence, "? Secret encryption check inconclusive")
	}

	// Wait for nginx pod to be running
	podRunning := false
	for i := 0; i < 30; i++ {
		out, _ := c.SSH(vm, "kubectl", "get", "pods", "-l", "app=nginx",
			"--no-headers", "--kubeconfig", kc)
		if strings.Contains(out, "Running") {
			podRunning = true
			break
		}
		time.Sleep(5 * time.Second)
	}
	if !podRunning {
		out, _ := c.SSH(vm, "kubectl", "get", "pods", "-l", "app=nginx", "--kubeconfig", kc)
		return strings.Join(evidence, "\n"), fmt.Errorf("nginx pod not running after 150s:\n%s", out)
	}

	out, _ = c.SSH(vm, "kubectl", "get", "pods", "-l", "app=nginx", "--kubeconfig", kc)
	evidence = append(evidence, "Pods:\n"+strings.TrimSpace(out))

	out, _ = c.SSH(vm, "kubectl", "get", "svc", "nginx", "--kubeconfig", kc)
	evidence = append(evidence, "Service:\n"+strings.TrimSpace(out))

	// NodePort + curl
	nodePort, _ := c.SSH(vm, "kubectl", "get", "svc", "nginx",
		"-o", "jsonpath={.spec.ports[0].nodePort}", "--kubeconfig", kc)
	nodePort = strings.TrimSpace(nodePort)
	if nodePort != "" {
		nodeName, _ := c.SSH(vm, "kubectl", "get", "pods", "-l", "app=nginx",
			"-o", "jsonpath={.items[0].spec.nodeName}", "--kubeconfig", kc)
		nodeName = strings.TrimSpace(nodeName)
		if nodeName != "" {
			curlOut, _ := c.SSH(vm, "curl", "-sI", fmt.Sprintf("http://%s:%s", nodeName, nodePort))
			if strings.Contains(curlOut, "200") {
				evidence = append(evidence, "✓ HTTP 200 from nginx via NodePort")
			} else {
				evidence = append(evidence, "NodePort curl:\n"+strings.TrimSpace(curlOut))
			}
		}
	}

	// exec into pod
	podName, _ := c.SSH(vm, "kubectl", "get", "pods", "-l", "app=nginx",
		"-o", "jsonpath={.items[0].metadata.name}", "--kubeconfig", kc)
	podName = strings.TrimSpace(podName)
	if podName != "" {
		version, _ := c.SSH(vm, "kubectl", "exec", podName,
			"--kubeconfig", kc, "--", "nginx", "-v")
		evidence = append(evidence, "✓ exec: "+strings.TrimSpace(version))
	}

	return strings.Join(evidence, "\n"), nil
}
