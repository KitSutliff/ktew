package main

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

// ensureDeps checks for required external tools and installs any that are missing.
// This is the maximum-laziness engine — the user runs the binary and it handles the rest.
func ensureDeps() error {
	if _, err := exec.LookPath("limactl"); err != nil {
		fmt.Println("  ⚡ lima not found — installing...")
		if err := installLima(); err != nil {
			return fmt.Errorf("install lima: %w", err)
		}
		fmt.Println("  ✓ lima ready")
	}

	if runtime.GOOS == "linux" {
		qemu := qemuSystemBin()
		if _, err := exec.LookPath(qemu); err != nil {
			fmt.Printf("  ⚡ %s not found — installing...\n", qemu)
			if err := installQEMU(); err != nil {
				return fmt.Errorf("install QEMU: %w", err)
			}
			fmt.Println("  ✓ QEMU ready")
		}
	}

	if runtime.GOOS == "darwin" {
		if socketVmnetPath() == "" {
			fmt.Println("  ⚡ socket_vmnet not found — installing...")
			if err := installSocketVmnet(); err != nil {
				return fmt.Errorf("install socket_vmnet: %w", err)
			}
		}
		if err := fixSocketVmnetOwnership(); err != nil {
			return fmt.Errorf("fix socket_vmnet ownership: %w", err)
		}
		fmt.Println("  ✓ socket_vmnet ready")
	}

	return nil
}

func qemuSystemBin() string {
	if runtime.GOARCH == "amd64" {
		return "qemu-system-x86_64"
	}
	return "qemu-system-aarch64"
}

// --- Lima ---

func installLima() error {
	if runtime.GOOS == "darwin" {
		return installLimaBrew()
	}
	return installLimaGitHub()
}

func installLimaBrew() error {
	if _, err := exec.LookPath("brew"); err != nil {
		return fmt.Errorf("homebrew required on macOS — install from https://brew.sh")
	}
	return run("brew", "install", "lima")
}

type ghRelease struct {
	TagName string    `json:"tag_name"`
	Assets  []ghAsset `json:"assets"`
}

type ghAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

func installLimaGitHub() error {
	version, dlURL, err := latestLimaRelease()
	if err != nil {
		return fmt.Errorf("find latest release: %w", err)
	}
	fmt.Printf("    fetching lima %s for Linux/%s...\n", version, runtime.GOARCH)

	localPrefix := filepath.Join(os.Getenv("HOME"), ".local")
	if err := downloadAndExtractLima(dlURL, localPrefix); err != nil {
		return err
	}

	binDir := filepath.Join(localPrefix, "bin")
	if path := os.Getenv("PATH"); !strings.Contains(path, binDir) {
		os.Setenv("PATH", binDir+string(os.PathListSeparator)+path)
	}

	if _, err := exec.LookPath("limactl"); err != nil {
		return fmt.Errorf("limactl not on PATH after install — check %s", binDir)
	}
	return nil
}

func latestLimaRelease() (version, url string, err error) {
	resp, err := http.Get("https://api.github.com/repos/lima-vm/lima/releases/latest")
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", "", fmt.Errorf("GitHub API: HTTP %d (rate-limited? try again shortly)", resp.StatusCode)
	}

	var rel ghRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return "", "", fmt.Errorf("parse release: %w", err)
	}

	version = strings.TrimPrefix(rel.TagName, "v")
	arch := "x86_64"
	if runtime.GOARCH == "arm64" {
		arch = "aarch64"
	}

	suffix := fmt.Sprintf("Linux-%s.tar.gz", arch)
	for _, a := range rel.Assets {
		if strings.HasSuffix(a.Name, suffix) {
			return version, a.BrowserDownloadURL, nil
		}
	}
	return "", "", fmt.Errorf("no Lima binary for Linux/%s in release %s", arch, rel.TagName)
}

func downloadAndExtractLima(url, prefix string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d downloading Lima", resp.StatusCode)
	}

	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		return err
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	extracted := 0
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		clean := normalizeTarPath(hdr.Name)

		if hdr.Typeflag == tar.TypeDir {
			if strings.HasPrefix(clean, "bin/") || strings.HasPrefix(clean, "share/") {
				os.MkdirAll(filepath.Join(prefix, clean), 0755)
			}
			continue
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		if !strings.HasPrefix(clean, "bin/") && !strings.HasPrefix(clean, "share/") {
			continue
		}

		dest := filepath.Join(prefix, clean)
		os.MkdirAll(filepath.Dir(dest), 0755)
		f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(hdr.Mode)|0755)
		if err != nil {
			return fmt.Errorf("extract %s: %w", clean, err)
		}
		if _, err := io.Copy(f, tr); err != nil {
			f.Close()
			return err
		}
		f.Close()
		extracted++
	}

	if extracted == 0 {
		return fmt.Errorf("lima tarball contained no extractable files")
	}
	fmt.Printf("    → %s (%d files)\n", filepath.Join(prefix, "bin"), extracted)
	return nil
}

// normalizeTarPath strips an optional top-level directory prefix from tarball entries.
// Handles both "bin/limactl" and "lima-0.24.0/bin/limactl" layouts.
func normalizeTarPath(name string) string {
	parts := strings.SplitN(name, "/", 2)
	if len(parts) < 2 {
		return name
	}
	if parts[0] == "bin" || parts[0] == "share" {
		return name
	}
	return parts[1]
}

// --- QEMU (Linux only) ---

func installQEMU() error {
	pm := detectPackageManager()
	var pkg string
	switch pm {
	case "apt-get":
		if runtime.GOARCH == "arm64" {
			pkg = "qemu-system-arm"
		} else {
			pkg = "qemu-system-x86"
		}
		if err := sudoRun("apt-get", "update", "-qq"); err != nil {
			return fmt.Errorf("apt-get update: %w", err)
		}
		return sudoRun("apt-get", "install", "-y", "-qq", pkg)
	case "dnf":
		if runtime.GOARCH == "arm64" {
			pkg = "qemu-system-aarch64-core"
		} else {
			pkg = "qemu-system-x86-core"
		}
		return sudoRun("dnf", "install", "-y", pkg)
	case "pacman":
		if runtime.GOARCH == "arm64" {
			pkg = "qemu-system-aarch64"
		} else {
			pkg = "qemu-system-x86"
		}
		return sudoRun("pacman", "-Sy", "--noconfirm", pkg)
	default:
		return fmt.Errorf("no supported package manager (need apt-get, dnf, or pacman) — install %s manually", qemuSystemBin())
	}
}

func detectPackageManager() string {
	for _, pm := range []string{"apt-get", "dnf", "pacman"} {
		if _, err := exec.LookPath(pm); err == nil {
			return pm
		}
	}
	return ""
}

// --- socket_vmnet (macOS only) ---

// socketVmnetPath returns the path to the socket_vmnet binary, or "" if not found.
// Checks Homebrew prefix first (works on both Intel and Apple Silicon), then the legacy path.
func socketVmnetPath() string {
	out, err := exec.Command("brew", "--prefix", "socket_vmnet").Output()
	if err == nil {
		bin := filepath.Join(strings.TrimSpace(string(out)), "bin", "socket_vmnet")
		if _, err := os.Stat(bin); err == nil {
			return bin
		}
	}
	legacy := "/opt/socket_vmnet/bin/socket_vmnet"
	if _, err := os.Stat(legacy); err == nil {
		return legacy
	}
	return ""
}

// fixSocketVmnetOwnership ensures the socket_vmnet binary is owned by root,
// which Lima requires for its privileged network helper.
func fixSocketVmnetOwnership() error {
	bin := socketVmnetPath()
	if bin == "" {
		return fmt.Errorf("socket_vmnet binary not found after install")
	}
	real, err := filepath.EvalSymlinks(bin)
	if err != nil {
		return fmt.Errorf("resolve socket_vmnet path: %w", err)
	}
	info, err := os.Stat(real)
	if err != nil {
		return err
	}
	stat := info.Sys().(*syscall.Stat_t)
	if stat.Uid == 0 {
		return nil
	}
	fmt.Printf("  ⚡ fixing socket_vmnet ownership (must be root): %s\n", real)
	if err := sudoRun("chown", "root:wheel", real); err != nil {
		return fmt.Errorf("chown socket_vmnet: %w", err)
	}
	info, err = os.Stat(real)
	if err != nil {
		return err
	}
	stat = info.Sys().(*syscall.Stat_t)
	if stat.Uid != 0 {
		return fmt.Errorf("socket_vmnet at %s still not owned by root after chown (uid=%d)", real, stat.Uid)
	}
	return nil
}

func installSocketVmnet() error {
	if _, err := exec.LookPath("brew"); err != nil {
		return fmt.Errorf("homebrew required on macOS — install from https://brew.sh")
	}
	if err := run("brew", "install", "socket_vmnet"); err != nil {
		return err
	}
	fmt.Println("    configuring sudoers for socket_vmnet...")
	cmd := exec.Command("bash", "-c", "limactl sudoers | sudo tee /etc/sudoers.d/lima > /dev/null")
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// sudoRun runs a command via sudo with stdin connected for password prompts.
// Skips sudo entirely if already root.
func sudoRun(args ...string) error {
	if os.Getuid() == 0 {
		cmd := exec.Command(args[0], args[1:]...)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}
	cmd := exec.Command("sudo", args...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
