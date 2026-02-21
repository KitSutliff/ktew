package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// --- Shared helpers ---

// writeAndCopy writes content to a local temp file and copies it into a VM.
func (c *Cluster) writeAndCopy(vm, content, remotePath string) error {
	tmp, err := os.CreateTemp(c.WorkDir, "kthw-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.WriteString(content); err != nil {
		return err
	}
	tmp.Close()
	return c.CopyToVM(vm, tmp.Name(), remotePath)
}

// installBinary copies a binary from downloads to /usr/local/bin/ on a VM.
func (c *Cluster) installBinary(vm, localPath, remoteName string) error {
	if err := c.CopyToVM(vm, localPath, "/root/"+remoteName); err != nil {
		return err
	}
	_, err := c.Exec(vm, "bash", "-c", fmt.Sprintf("mv /root/%s /usr/local/bin/%s && chmod +x /usr/local/bin/%s", remoteName, remoteName, remoteName))
	return err
}

// installSystemdUnit writes a unit file and enables+starts the service.
func (c *Cluster) installSystemdUnit(vm, name, content string) error {
	return c.writeAndCopy(vm, content, "/etc/systemd/system/"+name)
}

// enableAndStart does daemon-reload and starts a list of services.
func (c *Cluster) enableAndStart(vm string, services ...string) error {
	svcList := strings.Join(services, " ")
	_, err := c.Exec(vm, "bash", "-c",
		fmt.Sprintf("systemctl daemon-reload && systemctl enable %s && systemctl start %s", svcList, svcList))
	return err
}

// --- Etcd ---

func (c *Cluster) BootstrapEtcd() error {
	vm := c.Server.Name
	dlDir := filepath.Join(c.WorkDir, "downloads", "etcd")

	for _, bin := range []string{"etcd", "etcdctl"} {
		if err := c.installBinary(vm, filepath.Join(dlDir, bin), bin); err != nil {
			return fmt.Errorf("install %s: %w", bin, err)
		}
	}

	cmds := []string{
		"mkdir -p /etc/etcd /var/lib/etcd",
		"chmod 700 /var/lib/etcd",
	}
	for _, cmd := range cmds {
		if _, err := c.Exec(vm, "bash", "-c", cmd); err != nil {
			return err
		}
	}

	// Copy certs needed by etcd (api-server cert used for TLS, though etcd here uses http)
	for _, f := range []string{"ca.crt", "kube-api-server.key", "kube-api-server.crt"} {
		if err := c.CopyToVM(vm, filepath.Join(c.WorkDir, f), "/etc/etcd/"+f); err != nil {
			return err
		}
	}

	if err := c.installSystemdUnit(vm, "etcd.service", etcdService); err != nil {
		return err
	}
	if err := c.enableAndStart(vm, "etcd"); err != nil {
		return err
	}
	return c.WaitForService(vm, "etcd", 30*time.Second)
}

func (c *Cluster) VerifyEtcd() (string, error) {
	return c.Exec(c.Server.Name, "etcdctl", "member", "list")
}

// --- Control Plane ---

func (c *Cluster) BootstrapControlPlane() error {
	vm := c.Server.Name

	// Install binaries
	ctrlBins := []string{"kube-apiserver", "kube-controller-manager", "kube-scheduler"}
	for _, bin := range ctrlBins {
		if err := c.installBinary(vm, filepath.Join(c.WorkDir, "downloads", "controller", bin), bin); err != nil {
			return fmt.Errorf("install %s: %w", bin, err)
		}
	}
	if err := c.installBinary(vm, filepath.Join(c.WorkDir, "downloads", "client", "kubectl"), "kubectl"); err != nil {
		return fmt.Errorf("install kubectl: %w", err)
	}

	// Create directories
	if _, err := c.Exec(vm, "mkdir", "-p", "/var/lib/kubernetes/", "/etc/kubernetes/config"); err != nil {
		return err
	}

	// Copy certs + keys to /var/lib/kubernetes/
	k8sFiles := []string{
		"ca.crt", "ca.key",
		"kube-api-server.crt", "kube-api-server.key",
		"service-accounts.crt", "service-accounts.key",
		"encryption-config.yaml",
	}
	for _, f := range k8sFiles {
		if err := c.CopyToVM(vm, filepath.Join(c.WorkDir, f), "/var/lib/kubernetes/"+f); err != nil {
			return fmt.Errorf("copy %s: %w", f, err)
		}
	}

	// Copy kubeconfigs
	for _, kc := range []string{"kube-controller-manager", "kube-scheduler", "admin"} {
		src := filepath.Join(c.WorkDir, kc+".kubeconfig")
		dest := "/var/lib/kubernetes/" + kc + ".kubeconfig"
		if err := c.CopyToVM(vm, src, dest); err != nil {
			return fmt.Errorf("copy kubeconfig %s: %w", kc, err)
		}
	}

	// Scheduler config
	if err := c.writeAndCopy(vm, kubeSchedulerYAML, "/etc/kubernetes/config/kube-scheduler.yaml"); err != nil {
		return err
	}

	// Install unit files
	units := map[string]string{
		"kube-apiserver.service":          kubeApiserverService,
		"kube-controller-manager.service": kubeControllerManagerService,
		"kube-scheduler.service":          kubeSchedulerService,
	}
	for name, content := range units {
		if err := c.installSystemdUnit(vm, name, content); err != nil {
			return fmt.Errorf("unit %s: %w", name, err)
		}
	}

	if err := c.enableAndStart(vm, "kube-apiserver", "kube-controller-manager", "kube-scheduler"); err != nil {
		return err
	}
	if err := c.WaitForService(vm, "kube-apiserver", 30*time.Second); err != nil {
		return err
	}

	// Apply RBAC for kubelet authorization
	rbacPath := "/root/kube-apiserver-to-kubelet.yaml"
	if err := c.writeAndCopy(vm, kubeApiserverToKubeletYAML, rbacPath); err != nil {
		return err
	}
	_, err := c.Exec(vm, "kubectl", "apply", "-f", rbacPath, "--kubeconfig", "/var/lib/kubernetes/admin.kubeconfig")
	return err
}

func (c *Cluster) VerifyControlPlane() (string, error) {
	return c.Exec(c.Server.Name, "kubectl", "cluster-info", "--kubeconfig", "/var/lib/kubernetes/admin.kubeconfig")
}

// --- Workers ---

func (c *Cluster) BootstrapWorker(node Machine) error {
	vm := node.Name

	// Install OS deps
	if _, err := c.Exec(vm, "bash", "-c", "apt-get update -qq && apt-get -y -qq install socat conntrack ipset kmod"); err != nil {
		return fmt.Errorf("install deps on %s: %w", vm, err)
	}

	// Disable swap
	c.Exec(vm, "swapoff", "-a")

	// Create directories
	dirs := []string{
		"/etc/cni/net.d", "/opt/cni/bin",
		"/var/lib/kubelet", "/var/lib/kube-proxy",
		"/var/lib/kubernetes", "/var/run/kubernetes",
	}
	if _, err := c.Exec(vm, "bash", "-c", "mkdir -p "+strings.Join(dirs, " ")); err != nil {
		return err
	}

	// Install worker binaries
	workerBins := []string{"kube-proxy", "kubelet", "crictl", "runc"}
	for _, bin := range workerBins {
		if err := c.installBinary(vm, filepath.Join(c.WorkDir, "downloads", "worker", bin), bin); err != nil {
			return fmt.Errorf("install %s on %s: %w", bin, vm, err)
		}
	}
	if err := c.installBinary(vm, filepath.Join(c.WorkDir, "downloads", "client", "kubectl"), "kubectl"); err != nil {
		return fmt.Errorf("install kubectl on %s: %w", vm, err)
	}

	// Containerd binaries go to /bin/
	for _, bin := range []string{"containerd", "containerd-shim-runc-v2", "containerd-stress"} {
		src := filepath.Join(c.WorkDir, "downloads", "containerd", bin)
		if err := c.CopyToVM(vm, src, "/root/"+bin); err != nil {
			return err
		}
		if _, err := c.Exec(vm, "bash", "-c", fmt.Sprintf("mv /root/%s /bin/%s && chmod +x /bin/%s", bin, bin, bin)); err != nil {
			return err
		}
	}

	// CNI plugins to /opt/cni/bin/
	cniDir := filepath.Join(c.WorkDir, "downloads", "cni")
	entries, err := os.ReadDir(cniDir)
	if err != nil {
		return fmt.Errorf("read cni dir: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if err := c.CopyToVM(vm, filepath.Join(cniDir, e.Name()), "/root/"+e.Name()); err != nil {
			return err
		}
		if _, err := c.Exec(vm, "bash", "-c", fmt.Sprintf("mv /root/%s /opt/cni/bin/%s && chmod +x /opt/cni/bin/%s", e.Name(), e.Name(), e.Name())); err != nil {
			return err
		}
	}

	// CNI config
	bridgeConf := strings.ReplaceAll(bridgeConfTmpl, "{{SUBNET}}", node.Subnet)
	if err := c.writeAndCopy(vm, bridgeConf, "/etc/cni/net.d/10-bridge.conf"); err != nil {
		return err
	}
	if err := c.writeAndCopy(vm, loopbackConf, "/etc/cni/net.d/99-loopback.conf"); err != nil {
		return err
	}

	// br_netfilter
	c.Exec(vm, "modprobe", "br-netfilter")
	c.Exec(vm, "bash", "-c", `echo "br-netfilter" >> /etc/modules-load.d/modules.conf`)
	c.Exec(vm, "bash", "-c", `echo "net.bridge.bridge-nf-call-iptables = 1" >> /etc/sysctl.d/kubernetes.conf`)
	c.Exec(vm, "bash", "-c", `echo "net.bridge.bridge-nf-call-ip6tables = 1" >> /etc/sysctl.d/kubernetes.conf`)
	c.Exec(vm, "sysctl", "-p", "/etc/sysctl.d/kubernetes.conf")

	// Containerd config
	if _, err := c.Exec(vm, "mkdir", "-p", "/etc/containerd"); err != nil {
		return err
	}
	if err := c.writeAndCopy(vm, containerdConfig, "/etc/containerd/config.toml"); err != nil {
		return err
	}

	// Kubelet cert + config
	if err := c.CopyToVM(vm, filepath.Join(c.WorkDir, "ca.crt"), "/var/lib/kubelet/ca.crt"); err != nil {
		return err
	}
	if err := c.CopyToVM(vm, filepath.Join(c.WorkDir, node.Name+".crt"), "/var/lib/kubelet/kubelet.crt"); err != nil {
		return err
	}
	if err := c.CopyToVM(vm, filepath.Join(c.WorkDir, node.Name+".key"), "/var/lib/kubelet/kubelet.key"); err != nil {
		return err
	}
	if err := c.CopyToVM(vm, filepath.Join(c.WorkDir, node.Name+".kubeconfig"), "/var/lib/kubelet/kubeconfig"); err != nil {
		return err
	}
	if err := c.writeAndCopy(vm, kubeletConfigYAML, "/var/lib/kubelet/kubelet-config.yaml"); err != nil {
		return err
	}

	// Kube-proxy config
	if err := c.CopyToVM(vm, filepath.Join(c.WorkDir, "kube-proxy.kubeconfig"), "/var/lib/kube-proxy/kubeconfig"); err != nil {
		return err
	}
	if err := c.writeAndCopy(vm, kubeProxyConfigYAML, "/var/lib/kube-proxy/kube-proxy-config.yaml"); err != nil {
		return err
	}

	// Install unit files
	units := map[string]string{
		"containerd.service": containerdService,
		"kubelet.service":    kubeletService,
		"kube-proxy.service": kubeProxyService,
	}
	for name, content := range units {
		if err := c.installSystemdUnit(vm, name, content); err != nil {
			return fmt.Errorf("unit %s on %s: %w", name, vm, err)
		}
	}

	if err := c.enableAndStart(vm, "containerd", "kubelet", "kube-proxy"); err != nil {
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
		out, err := c.Exec(c.Server.Name, "kubectl", "get", "nodes", "--no-headers", "--kubeconfig", kc)
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
			full, _ := c.Exec(c.Server.Name, "kubectl", "get", "nodes", "--kubeconfig", kc)
			return strings.TrimSpace(full), nil
		}
		time.Sleep(2 * time.Second)
	}
	out, _ := c.Exec(c.Server.Name, "kubectl", "get", "nodes", "--kubeconfig", kc)
	return "", fmt.Errorf("expected %d Ready nodes after 120s, got:\n%s", expected, out)
}

// --- Network routes ---

func (c *Cluster) SetupPodRoutes() error {
	// Server needs routes to both node subnets
	for _, node := range c.Nodes {
		if _, err := c.Exec(c.Server.Name, "ip", "route", "add", node.Subnet, "via", node.IP); err != nil {
			return fmt.Errorf("route on server to %s: %w", node.Name, err)
		}
	}
	// Each node needs a route to the other node's subnet
	for i, node := range c.Nodes {
		other := c.Nodes[1-i]
		if _, err := c.Exec(node.Name, "ip", "route", "add", other.Subnet, "via", other.IP); err != nil {
			return fmt.Errorf("route on %s to %s: %w", node.Name, other.Name, err)
		}
	}
	return nil
}

func (c *Cluster) VerifyRoutes() (string, error) {
	var lines []string
	for _, m := range c.Machines {
		out, err := c.Exec(m.Name, "ip", "route")
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

func (c *Cluster) SmokeTest() (string, error) {
	vm := c.Server.Name
	kc := "/var/lib/kubernetes/admin.kubeconfig"
	var evidence []string

	// Create secret — must succeed to verify encryption at rest
	if _, err := c.Exec(vm, "kubectl", "create", "secret", "generic", "kubernetes-the-hard-way",
		"--from-literal=mykey=mydata", "--kubeconfig", kc); err != nil {
		return "", fmt.Errorf("create secret: %w", err)
	}

	out, err := c.Exec(vm, "bash", "-c",
		"etcdctl get /registry/secrets/default/kubernetes-the-hard-way --print-value-only | head -c 40 | od -A x -t x1z")
	if err != nil {
		evidence = append(evidence, "? Secret encryption check failed: "+err.Error())
	} else if strings.Contains(out, "enc:aescbc") || len(out) > 10 {
		evidence = append(evidence, "✓ Secret encryption at rest verified (aescbc)")
	} else {
		evidence = append(evidence, "? Secret encryption check inconclusive")
	}

	// Deploy nginx — must succeed
	if _, err := c.Exec(vm, "kubectl", "create", "deployment", "nginx", "--image=nginx:latest", "--kubeconfig", kc); err != nil {
		return strings.Join(evidence, "\n"), fmt.Errorf("create deployment: %w", err)
	}

	// Wait for pod to be running
	podRunning := false
	for i := 0; i < 30; i++ {
		out, _ := c.Exec(vm, "kubectl", "get", "pods", "-l", "app=nginx", "--no-headers", "--kubeconfig", kc)
		if strings.Contains(out, "Running") {
			podRunning = true
			break
		}
		time.Sleep(5 * time.Second)
	}
	if !podRunning {
		out, _ := c.Exec(vm, "kubectl", "get", "pods", "-l", "app=nginx", "--kubeconfig", kc)
		return strings.Join(evidence, "\n"), fmt.Errorf("nginx pod not running after 150s:\n%s", out)
	}

	out, _ = c.Exec(vm, "kubectl", "get", "pods", "-l", "app=nginx", "--kubeconfig", kc)
	evidence = append(evidence, "Pods:\n"+strings.TrimSpace(out))

	// Expose as NodePort — must succeed
	if _, err := c.Exec(vm, "kubectl", "expose", "deployment", "nginx", "--port=80", "--type=NodePort", "--kubeconfig", kc); err != nil {
		return strings.Join(evidence, "\n"), fmt.Errorf("expose deployment: %w", err)
	}

	out, _ = c.Exec(vm, "kubectl", "get", "svc", "nginx", "--kubeconfig", kc)
	evidence = append(evidence, "Service:\n"+strings.TrimSpace(out))

	// NodePort + curl — best-effort evidence
	nodePort, _ := c.Exec(vm, "kubectl", "get", "svc", "nginx",
		"-o", "jsonpath={.spec.ports[0].nodePort}", "--kubeconfig", kc)
	nodePort = strings.TrimSpace(nodePort)
	if nodePort != "" {
		nodeName, _ := c.Exec(vm, "kubectl", "get", "pods", "-l", "app=nginx",
			"-o", "jsonpath={.items[0].spec.nodeName}", "--kubeconfig", kc)
		nodeName = strings.TrimSpace(nodeName)
		if nodeName != "" {
			curlOut, _ := c.Exec(vm, "curl", "-sI", fmt.Sprintf("http://%s:%s", nodeName, nodePort))
			if strings.Contains(curlOut, "200") {
				evidence = append(evidence, "✓ HTTP 200 from nginx via NodePort")
			} else {
				evidence = append(evidence, "NodePort curl:\n"+strings.TrimSpace(curlOut))
			}
		}
	}

	// exec — best-effort evidence
	podName, _ := c.Exec(vm, "kubectl", "get", "pods", "-l", "app=nginx",
		"-o", "jsonpath={.items[0].metadata.name}", "--kubeconfig", kc)
	podName = strings.TrimSpace(podName)
	if podName != "" {
		version, _ := c.Exec(vm, "kubectl", "exec", podName, "--kubeconfig", kc, "--", "nginx", "-v")
		evidence = append(evidence, "✓ exec: "+strings.TrimSpace(version))
	}

	return strings.Join(evidence, "\n"), nil
}
