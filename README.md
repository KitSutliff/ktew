# Allows the user to learn absolutely nothing about kubernetes... very quickly.

Automates the entire [Kubernetes The Hard Way](https://github.com/kelseyhightower/kubernetes-the-hard-way) tutorial with a single command on **standard macOS or Linux** (Apple Silicon, Intel Mac, or any x86_64/ARM64 Linux).

Provisions 4 Lima VMs (jumpbox, server, node-0, node-1), deploys a full Kubernetes cluster, and produces a TAP-formatted proof report documenting every step's completion.

## Prerequisites

- **Host:** macOS or Linux, arm64 or amd64.
- **Go 1.22+** to build from source.
- Everything else — Lima, QEMU (Linux), socket_vmnet (macOS) — is **detected and installed automatically** on first run.

## Usage

```bash
go build -o kthw . && ./kthw up
```

That's it. Missing dependencies are installed automatically. VMs are cleaned up after the run.

To tear down manually: `./kthw down`

## What it does

| Step | What | Verification |
|------|------|-------------|
| 1 | Prerequisites — create 4 Lima VMs | Hostname + IP reachable |
| 2 | Set up the jumpbox — install tools, download binaries | kubectl version, downloads listed |
| 3 | Provision compute resources — /etc/hosts, SSH keys | Jumpbox can SSH to all nodes |
| 4 | Provision CA and TLS certificates | Certificate subjects listed |
| 5 | Generate kubeconfigs for authentication | File sizes verified |
| 6 | Generate data encryption config and key | AES-CBC key present |
| 7 | Bootstrap etcd | `etcdctl member list` |
| 8 | Bootstrap control plane | `kubectl cluster-info` |
| 9 | Bootstrap worker nodes | `kubectl get nodes` shows Ready |
| 10 | Configure kubectl for remote access | `kubectl version` from jumpbox |
| 11 | Provision pod network routes | `ip route` shows pod CIDRs |
| 12 | Smoke test | Secret encryption, nginx deployment, NodePort, exec |
| 13 | Cleaning up | VMs destroyed |

## Output

**Terminal:** [TAP](https://testanything.org/) (Test Anything Protocol) formatted output — machine-parseable, human-readable.

**Report:** `kthw-work/kthw-report.md` — Markdown document with timestamped evidence for each step.

**Kubeconfig:** kubectl is configured on the jumpbox VM during the run. The cluster is ephemeral — cleaned up after the smoke test.

## Design constraints

- **Go standard library only.** Zero external Go dependencies. All crypto, HTTP, and templating use stdlib packages.
- **Single binary.** `go build` produces one executable.
- **DRY.** One function generates all certs. One function generates all kubeconfigs. One abstraction for VM commands. One pattern for systemd services.
- **Proof-driven.** Every step has a mandatory verification function. You cannot add a step without also proving it worked.

## Versions

Matches KTHW tutorial binary versions:
- Kubernetes v1.32.3
- etcd v3.6.0-rc.3
- containerd v2.1.0-beta.0
- CNI plugins v1.6.2
- runc v1.3.0-rc.1
- crictl v1.32.0
