 # Spinout checklist (when creating the new repo)

Use this when you create the standalone open-source repo so nothing internal slips through.

## Before you create the new repo

- [ ] **Module path:** If the new repo is not `github.com/kitsutliff/kthw`, run:
  ```bash
  go mod edit -module=github.com/YOUR_ORG/YOUR_REPO
  ```
- [ ] **Naming:** Project is "ktew" (Kubernetes The Easy Way); binary is `kthw` (Kubernetes The Hard Way). README and usage are consistent; decide if you want to rename the binary for the public repo or keep `kthw`.

## What to include in the new repo

- All `*.go` files, `go.mod`, `README.md`, `LICENSE`, `.gitignore`
- This file (optional; you can delete it after spinout)

## What must NOT be in the new repo

- `kthw-work/` — generated certs, keys, kubeconfigs, report (contains secrets)
- `.lima-install/` — local Lima install; users install Lima themselves
- Binaries `kthw`, `ktew` — users run `go build -o kthw .`

## After creating the repo

- Add repo URL to README if desired
- Enable GitHub Actions for CI (e.g. `go build`, `go test`) if you want
- Tag first release (e.g. `v0.1.0`) when ready
