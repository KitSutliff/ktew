package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"text/template"
)

// KubeconfigSpec defines a kubeconfig to generate — one struct, one template.
type KubeconfigSpec struct {
	ClusterName string
	Server      string
	User        string
	CACertPEM   []byte
	ClientCert  []byte
	ClientKey   []byte
}

var kubeconfigTmpl = template.Must(template.New("kubeconfig").Parse(`apiVersion: v1
kind: Config
clusters:
  - cluster:
      certificate-authority-data: {{ .CAData }}
      server: {{ .Server }}
    name: {{ .ClusterName }}
contexts:
  - context:
      cluster: {{ .ClusterName }}
      user: {{ .User }}
    name: default
current-context: default
users:
  - name: {{ .User }}
    user:
      client-certificate-data: {{ .CertData }}
      client-key-data: {{ .KeyData }}
`))

func GenKubeconfig(spec KubeconfigSpec) ([]byte, error) {
	data := map[string]string{
		"CAData":      b64(spec.CACertPEM),
		"Server":      spec.Server,
		"ClusterName": spec.ClusterName,
		"User":        spec.User,
		"CertData":    b64(spec.ClientCert),
		"KeyData":     b64(spec.ClientKey),
	}
	var buf strings.Builder
	if err := kubeconfigTmpl.Execute(&buf, data); err != nil {
		return nil, err
	}
	return []byte(buf.String()), nil
}

func b64(data []byte) string { return base64.StdEncoding.EncodeToString(data) }

// AllKubeconfigs generates every kubeconfig required by the tutorial.
func AllKubeconfigs(pki *PKI, serverURL string) (map[string][]byte, error) {
	type kcDef struct {
		name     string
		certName string
		user     string
	}
	defs := []kcDef{
		{"node-0", "node-0", "system:node:node-0"},
		{"node-1", "node-1", "system:node:node-1"},
		{"kube-proxy", "kube-proxy", "system:kube-proxy"},
		{"kube-controller-manager", "kube-controller-manager", "system:kube-controller-manager"},
		{"kube-scheduler", "kube-scheduler", "system:kube-scheduler"},
		{"admin", "admin", "admin"},
	}

	result := make(map[string][]byte)
	for _, d := range defs {
		cert, err := pki.ReadPEM(d.certName, ".crt")
		if err != nil {
			return nil, fmt.Errorf("read cert %s: %w", d.certName, err)
		}
		key, err := pki.ReadPEM(d.certName, ".key")
		if err != nil {
			return nil, fmt.Errorf("read key %s: %w", d.certName, err)
		}
		svr := serverURL
		if d.name == "admin" && runtime.GOOS == "linux" {
			// On Linux we port-forward 6443 to host; use localhost so host kubectl works.
			svr = "https://127.0.0.1:6443"
		}
		kc, err := GenKubeconfig(KubeconfigSpec{
			ClusterName: "kubernetes-the-hard-way",
			Server:      svr,
			User:        d.user,
			CACertPEM:   pki.CACertPEM,
			ClientCert:  cert,
			ClientKey:   key,
		})
		if err != nil {
			return nil, fmt.Errorf("gen kubeconfig %s: %w", d.name, err)
		}
		result[d.name] = kc
	}
	return result, nil
}

// WriteKubeconfigs writes all kubeconfigs to the working directory.
func WriteKubeconfigs(dir string, configs map[string][]byte) error {
	for name, data := range configs {
		path := filepath.Join(dir, name+".kubeconfig")
		if err := os.WriteFile(path, data, 0600); err != nil {
			return fmt.Errorf("write %s: %w", name, err)
		}
	}
	return nil
}

// GenEncryptionConfig generates the encryption-config.yaml with a random key.
var encryptionTmpl = template.Must(template.New("enc").Parse(`kind: EncryptionConfiguration
apiVersion: apiserver.config.k8s.io/v1
resources:
  - resources:
      - secrets
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: {{ .Key }}
      - identity: {}
`))

func GenEncryptionConfig(dir string) (string, error) {
	keyBytes := make([]byte, 32)
	if _, err := rand.Read(keyBytes); err != nil {
		return "", err
	}
	key := base64.StdEncoding.EncodeToString(keyBytes)

	var buf strings.Builder
	if err := encryptionTmpl.Execute(&buf, map[string]string{"Key": key}); err != nil {
		return "", err
	}
	path := filepath.Join(dir, "encryption-config.yaml")
	if err := os.WriteFile(path, []byte(buf.String()), 0600); err != nil {
		return "", err
	}
	return path, nil
}
