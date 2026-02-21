# Allows the user to learn absolutely nothing about kubernetes... very quickly.

Automates the entire [Kubernetes The Hard Way](https://github.com/kelseyhightower/kubernetes-the-hard-way) tutorial with a single command on **standard macOS or Linux** (Apple Silicon, Intel Mac, or any x86_64/ARM64 Linux).

Produces a Kubernetes cluster (1 control plane + 2 workers) running in Lima VMs, plus a TAP-formatted proof report documenting every step's completion.

## Prerequisites

- **Host:** macOS or Linux, arm64 or amd64.
- **Go 1.22+** to build from source.
- Everything else — Lima, QEMU (Linux), socket_vmnet (macOS) — is **detected and installed automatically** on first run.

## Usage

```bash
go build -o kthw . && ./kthw up
```

That's it. Missing dependencies are installed automatically. VMs are cleaned up after the run.

On Linux, `admin.kubeconfig` uses `127.0.0.1:6443` (port-forwarded from the server VM).

To tear down manually: `./kthw down`

## What it does

| Step | What | Verification |
|------|------|-------------|
| 1 | Create 3 ARM64 Linux VMs via Lima | Hostname + IP reachable |
| 2 | Generate CA + 8 TLS certificates | Certificate subjects listed |
| 3 | Generate 6 kubeconfigs | File sizes verified |
| 4 | Generate encryption config | AES-CBC key present |
| 5 | Download k8s, etcd, containerd, CNI binaries | All binaries present |
| 6 | Bootstrap etcd | `etcdctl member list` |
| 7 | Bootstrap control plane | `kubectl cluster-info` |
| 8 | Bootstrap workers | `kubectl get nodes` shows Ready |
| 9 | Configure pod network routes | `ip route` shows pod CIDRs |
| 10 | Smoke test | Secret encryption, nginx deployment, NodePort, exec |

## Output

**Terminal:** [TAP](https://testanything.org/) (Test Anything Protocol) formatted output — machine-parseable, human-readable.

**Report:** `kthw-work/kthw-report.md` — Markdown document with timestamped evidence for each step.

**Kubeconfig:** `kthw-work/admin.kubeconfig` — ready to use with `kubectl`.

## Design constraints

- **Go standard library only.** Zero external Go dependencies. All crypto, HTTP, templating, and tar extraction use stdlib packages.
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
