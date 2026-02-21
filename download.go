package main

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Binary download URLs per guest arch — same versions as KTHW; guest arch = host arch.
var downloadsByArch = map[string]map[string][]dl{
	"arm64": {
		"controller": {
			{url: "https://dl.k8s.io/v1.32.3/bin/linux/arm64/kube-apiserver", name: "kube-apiserver"},
			{url: "https://dl.k8s.io/v1.32.3/bin/linux/arm64/kube-controller-manager", name: "kube-controller-manager"},
			{url: "https://dl.k8s.io/v1.32.3/bin/linux/arm64/kube-scheduler", name: "kube-scheduler"},
		},
		"worker": {
			{url: "https://dl.k8s.io/v1.32.3/bin/linux/arm64/kube-proxy", name: "kube-proxy"},
			{url: "https://dl.k8s.io/v1.32.3/bin/linux/arm64/kubelet", name: "kubelet"},
			{url: "https://github.com/kubernetes-sigs/cri-tools/releases/download/v1.32.0/crictl-v1.32.0-linux-arm64.tar.gz", name: "crictl", isTarGz: true},
			{url: "https://github.com/opencontainers/runc/releases/download/v1.3.0-rc.1/runc.arm64", name: "runc"},
		},
		"client": {
			{url: "https://dl.k8s.io/v1.32.3/bin/linux/arm64/kubectl", name: "kubectl"},
		},
		"etcd": {
			{url: "https://github.com/etcd-io/etcd/releases/download/v3.6.0-rc.3/etcd-v3.6.0-rc.3-linux-arm64.tar.gz", name: "etcd", isTarGz: true, extractNames: []string{"etcd", "etcdctl"}},
		},
		"containerd": {
			{url: "https://github.com/containerd/containerd/releases/download/v2.1.0-beta.0/containerd-2.1.0-beta.0-linux-arm64.tar.gz", name: "containerd", isTarGz: true, extractNames: []string{"containerd", "containerd-shim-runc-v2", "containerd-stress"}},
		},
		"cni": {
			{url: "https://github.com/containernetworking/plugins/releases/download/v1.6.2/cni-plugins-linux-arm64-v1.6.2.tgz", name: "cni-plugins", isTarGz: true},
		},
	},
	"amd64": {
		"controller": {
			{url: "https://dl.k8s.io/v1.32.3/bin/linux/amd64/kube-apiserver", name: "kube-apiserver"},
			{url: "https://dl.k8s.io/v1.32.3/bin/linux/amd64/kube-controller-manager", name: "kube-controller-manager"},
			{url: "https://dl.k8s.io/v1.32.3/bin/linux/amd64/kube-scheduler", name: "kube-scheduler"},
		},
		"worker": {
			{url: "https://dl.k8s.io/v1.32.3/bin/linux/amd64/kube-proxy", name: "kube-proxy"},
			{url: "https://dl.k8s.io/v1.32.3/bin/linux/amd64/kubelet", name: "kubelet"},
			{url: "https://github.com/kubernetes-sigs/cri-tools/releases/download/v1.32.0/crictl-v1.32.0-linux-amd64.tar.gz", name: "crictl", isTarGz: true},
			{url: "https://github.com/opencontainers/runc/releases/download/v1.3.0-rc.1/runc.amd64", name: "runc"},
		},
		"client": {
			{url: "https://dl.k8s.io/v1.32.3/bin/linux/amd64/kubectl", name: "kubectl"},
		},
		"etcd": {
			{url: "https://github.com/etcd-io/etcd/releases/download/v3.6.0-rc.3/etcd-v3.6.0-rc.3-linux-amd64.tar.gz", name: "etcd", isTarGz: true, extractNames: []string{"etcd", "etcdctl"}},
		},
		"containerd": {
			{url: "https://github.com/containerd/containerd/releases/download/v2.1.0-beta.0/containerd-2.1.0-beta.0-linux-amd64.tar.gz", name: "containerd", isTarGz: true, extractNames: []string{"containerd", "containerd-shim-runc-v2", "containerd-stress"}},
		},
		"cni": {
			{url: "https://github.com/containernetworking/plugins/releases/download/v1.6.2/cni-plugins-linux-amd64-v1.6.2.tgz", name: "cni-plugins", isTarGz: true},
		},
	},
}

type dl struct {
	url          string
	name         string
	isTarGz      bool
	extractNames []string // if set, only extract these from tarball
	sha256       string   // expected hex-encoded SHA256; skipped if empty
}

// DownloadAll fetches all binaries for the current host arch and returns a summary.
func DownloadAll(baseDir string) (string, error) {
	arch := runtime.GOARCH
	downloads, ok := downloadsByArch[arch]
	if !ok {
		return "", fmt.Errorf("no downloads for arch %s", arch)
	}
	var summary []string
	total := 0
	for group, dls := range downloads {
		groupDir := filepath.Join(baseDir, "downloads", group)
		if err := os.MkdirAll(groupDir, 0755); err != nil {
			return "", err
		}
		for _, d := range dls {
			fmt.Printf("    ↓ %s\n", d.name)
			if d.isTarGz {
				if err := downloadAndExtract(d, groupDir); err != nil {
					return "", fmt.Errorf("download %s: %w", d.name, err)
				}
			} else {
				dest := filepath.Join(groupDir, d.name)
				if err := downloadFile(d.url, dest, d.sha256); err != nil {
					return "", fmt.Errorf("download %s: %w", d.name, err)
				}
				os.Chmod(dest, 0755)
			}
			total++
		}
		summary = append(summary, fmt.Sprintf("  %s: %d binaries", group, len(dls)))
	}
	return fmt.Sprintf("Downloaded %d packages:\n%s", total, strings.Join(summary, "\n")), nil
}

func downloadFile(url, dest, expectedHash string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d for %s", resp.StatusCode, url)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()

	h := sha256.New()
	w := io.MultiWriter(f, h)
	if _, err := io.Copy(w, resp.Body); err != nil {
		return err
	}

	if expectedHash != "" {
		got := hex.EncodeToString(h.Sum(nil))
		if got != expectedHash {
			return fmt.Errorf("checksum mismatch for %s: expected %s, got %s", filepath.Base(dest), expectedHash, got)
		}
	}
	return nil
}

func downloadAndExtract(d dl, destDir string) error {
	resp, err := http.Get(d.url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d for %s", resp.StatusCode, d.url)
	}

	var reader io.Reader = resp.Body

	// Tee through SHA256 if checksum is specified
	h := sha256.New()
	if d.sha256 != "" {
		reader = io.TeeReader(reader, h)
	}

	gz, err := gzip.NewReader(reader)
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)

	wantAll := len(d.extractNames) == 0
	wanted := map[string]bool{}
	for _, n := range d.extractNames {
		wanted[n] = true
	}
	found := map[string]bool{}

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		baseName := filepath.Base(hdr.Name)
		if !wantAll && !wanted[baseName] {
			continue
		}
		dest := filepath.Join(destDir, baseName)
		f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
		if err != nil {
			return err
		}
		if _, err := io.Copy(f, tr); err != nil {
			f.Close()
			return err
		}
		f.Close()
		found[baseName] = true
	}

	// Drain any remaining data so the full archive is hashed
	if d.sha256 != "" {
		io.Copy(io.Discard, reader)
		got := hex.EncodeToString(h.Sum(nil))
		if got != d.sha256 {
			return fmt.Errorf("checksum mismatch for %s: expected %s, got %s", d.name, d.sha256, got)
		}
	}

	// Verify all expected files were extracted
	if len(d.extractNames) > 0 {
		var missing []string
		for _, name := range d.extractNames {
			if !found[name] {
				missing = append(missing, name)
			}
		}
		if len(missing) > 0 {
			return fmt.Errorf("missing expected files in %s: %s", d.name, strings.Join(missing, ", "))
		}
	}

	return nil
}
