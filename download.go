package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
)

// Download URLs per guest arch — same versions as KTHW; jumpbox is always Linux.
var downloadURLs = map[string][]string{
	"arm64": {
		"https://dl.k8s.io/v1.32.3/bin/linux/arm64/kubectl",
		"https://dl.k8s.io/v1.32.3/bin/linux/arm64/kube-apiserver",
		"https://dl.k8s.io/v1.32.3/bin/linux/arm64/kube-controller-manager",
		"https://dl.k8s.io/v1.32.3/bin/linux/arm64/kube-scheduler",
		"https://dl.k8s.io/v1.32.3/bin/linux/arm64/kube-proxy",
		"https://dl.k8s.io/v1.32.3/bin/linux/arm64/kubelet",
		"https://github.com/kubernetes-sigs/cri-tools/releases/download/v1.32.0/crictl-v1.32.0-linux-arm64.tar.gz",
		"https://github.com/opencontainers/runc/releases/download/v1.3.0-rc.1/runc.arm64",
		"https://github.com/containernetworking/plugins/releases/download/v1.6.2/cni-plugins-linux-arm64-v1.6.2.tgz",
		"https://github.com/containerd/containerd/releases/download/v2.1.0-beta.0/containerd-2.1.0-beta.0-linux-arm64.tar.gz",
		"https://github.com/etcd-io/etcd/releases/download/v3.6.0-rc.3/etcd-v3.6.0-rc.3-linux-arm64.tar.gz",
	},
	"amd64": {
		"https://dl.k8s.io/v1.32.3/bin/linux/amd64/kubectl",
		"https://dl.k8s.io/v1.32.3/bin/linux/amd64/kube-apiserver",
		"https://dl.k8s.io/v1.32.3/bin/linux/amd64/kube-controller-manager",
		"https://dl.k8s.io/v1.32.3/bin/linux/amd64/kube-scheduler",
		"https://dl.k8s.io/v1.32.3/bin/linux/amd64/kube-proxy",
		"https://dl.k8s.io/v1.32.3/bin/linux/amd64/kubelet",
		"https://github.com/kubernetes-sigs/cri-tools/releases/download/v1.32.0/crictl-v1.32.0-linux-amd64.tar.gz",
		"https://github.com/opencontainers/runc/releases/download/v1.3.0-rc.1/runc.amd64",
		"https://github.com/containernetworking/plugins/releases/download/v1.6.2/cni-plugins-linux-amd64-v1.6.2.tgz",
		"https://github.com/containerd/containerd/releases/download/v2.1.0-beta.0/containerd-2.1.0-beta.0-linux-amd64.tar.gz",
		"https://github.com/etcd-io/etcd/releases/download/v3.6.0-rc.3/etcd-v3.6.0-rc.3-linux-amd64.tar.gz",
	},
}

// extractScript generates the extraction + organization commands that run on the
// jumpbox after raw downloads are in place. Matches KTHW step 02 organization.
func extractScript(arch string) string {
	return fmt.Sprintf(`#!/bin/bash
set -euo pipefail
cd $HOME/kubernetes-the-hard-way

mkdir -p downloads/{client,cni,controller,worker,etcd,containerd}
tar -xf downloads/crictl-*-linux-%[1]s.tar.gz -C downloads/worker/
tar -xf downloads/containerd-*-linux-%[1]s.tar.gz --strip-components 1 -C downloads/containerd/
tar -xf downloads/cni-plugins-linux-%[1]s-*.tgz -C downloads/cni/
tar -xf downloads/etcd-*-linux-%[1]s.tar.gz -C downloads/etcd/ --strip-components 1 --wildcards '*/etcd' '*/etcdctl'

mv downloads/kubectl downloads/client/
mv downloads/kube-apiserver downloads/kube-controller-manager downloads/kube-scheduler downloads/controller/
mv downloads/kubelet downloads/kube-proxy downloads/worker/
mv downloads/runc.%[1]s downloads/worker/runc

rm -f downloads/*.gz downloads/*.tgz
chmod +x downloads/{client,cni,controller,worker,etcd,containerd}/*
`, arch)
}

// ensureCached downloads any missing binaries to the host cache at ~/.cache/ktew/.
// Returns the cache directory path. On repeat runs, this is essentially free.
func ensureCached(arch string) (string, error) {
	urls, ok := downloadURLs[arch]
	if !ok {
		return "", fmt.Errorf("no downloads for arch %s", arch)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".cache", "ktew", "downloads", arch)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("create cache dir: %w", err)
	}

	cached := 0
	for _, u := range urls {
		name := filepath.Base(u)
		dest := filepath.Join(dir, name)
		if info, err := os.Stat(dest); err == nil && info.Size() > 0 {
			cached++
			continue
		}
		fmt.Printf("    ↓ %s\n", name)
		if err := downloadFile(u, dest); err != nil {
			return "", fmt.Errorf("download %s: %w", name, err)
		}
	}
	if cached == len(urls) {
		fmt.Printf("    (all %d binaries cached)\n", cached)
	}
	return dir, nil
}

func downloadFile(url, dest string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d for %s", resp.StatusCode, url)
	}
	tmp := dest + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	f.Close()
	return os.Rename(tmp, dest)
}

// DownloadOnJumpbox ensures all K8s binaries are cached locally, copies them to
// the jumpbox, and extracts/organizes them — matching KTHW step 02.
func DownloadOnJumpbox(c *Cluster) error {
	arch := runtime.GOARCH

	cacheDir, err := ensureCached(arch)
	if err != nil {
		return err
	}

	jbDl := c.JumpboxDir + "/downloads"
	if _, err := c.Exec(c.Jumpbox.Name, "mkdir", "-p", jbDl); err != nil {
		return fmt.Errorf("create downloads dir: %w", err)
	}

	urls := downloadURLs[arch]
	for _, u := range urls {
		name := filepath.Base(u)
		localPath := filepath.Join(cacheDir, name)
		remotePath := jbDl + "/" + name
		if err := c.CopyToVM(c.Jumpbox.Name, localPath, remotePath); err != nil {
			return fmt.Errorf("copy %s to jumpbox: %w", name, err)
		}
	}

	script := extractScript(arch)
	if _, err := c.Exec(c.Jumpbox.Name, "bash", "-c", script); err != nil {
		return fmt.Errorf("extract binaries on jumpbox: %w", err)
	}

	return nil
}
