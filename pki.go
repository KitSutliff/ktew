package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// CertSpec defines what to generate. One struct, one function — every cert uses this.
type CertSpec struct {
	CN       string
	O        string
	DNSNames []string
	IPs      []net.IP
	IsCA     bool
	KeyUsage x509.KeyUsage
	ExtUsage []x509.ExtKeyUsage
}

// PKI holds the CA keypair and working directory.
type PKI struct {
	CACert    *x509.Certificate
	CAKey     *ecdsa.PrivateKey
	CACertPEM []byte
	CAKeyPEM  []byte
	Dir       string
}

// NewPKI generates a self-signed CA and returns a PKI that can issue certs.
func NewPKI(dir string) (*PKI, error) {
	caSpec := CertSpec{
		CN:       "Kubernetes",
		IsCA:     true,
		KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
	}
	caCert, caKey, certPEM, keyPEM, err := generateCert(caSpec, nil, nil)
	if err != nil {
		return nil, fmt.Errorf("generate CA: %w", err)
	}
	p := &PKI{CACert: caCert, CAKey: caKey, CACertPEM: certPEM, CAKeyPEM: keyPEM, Dir: dir}
	if err := p.writePair("ca", certPEM, keyPEM); err != nil {
		return nil, err
	}
	return p, nil
}

// Issue generates a certificate signed by the CA and writes it to disk.
func (p *PKI) Issue(name string, spec CertSpec) error {
	_, _, certPEM, keyPEM, err := generateCert(spec, p.CACert, p.CAKey)
	if err != nil {
		return fmt.Errorf("issue %s: %w", name, err)
	}
	return p.writePair(name, certPEM, keyPEM)
}

func (p *PKI) writePair(name string, certPEM, keyPEM []byte) error {
	if err := os.WriteFile(filepath.Join(p.Dir, name+".crt"), certPEM, 0644); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(p.Dir, name+".key"), keyPEM, 0600)
}

func (p *PKI) CertPath(name string) string { return filepath.Join(p.Dir, name+".crt") }
func (p *PKI) KeyPath(name string) string  { return filepath.Join(p.Dir, name+".key") }

func (p *PKI) ReadPEM(name, ext string) ([]byte, error) {
	return os.ReadFile(filepath.Join(p.Dir, name+ext))
}

// generateCert creates a key + cert. If parent/signer are nil, it's self-signed.
func generateCert(spec CertSpec, parent *x509.Certificate, signer *ecdsa.PrivateKey) (*x509.Certificate, *ecdsa.PrivateKey, []byte, []byte, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, nil, nil, err
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, nil, nil, err
	}

	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:   spec.CN,
			Organization: splitOrg(spec.O),
			Country:      []string{"US"},
			Province:     []string{"Washington"},
			Locality:     []string{"Seattle"},
		},
		NotBefore:             time.Now().Add(-1 * time.Hour),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour),
		KeyUsage:              spec.KeyUsage,
		ExtKeyUsage:           spec.ExtUsage,
		BasicConstraintsValid: true,
		IsCA:                  spec.IsCA,
		DNSNames:              spec.DNSNames,
		IPAddresses:           spec.IPs,
	}

	if spec.KeyUsage == 0 && !spec.IsCA {
		tmpl.KeyUsage = x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment
	}
	if len(spec.ExtUsage) == 0 && !spec.IsCA {
		tmpl.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}
	}

	signerKey := key
	signerCert := tmpl
	if parent != nil {
		signerKey = signer
		signerCert = parent
	}

	certDER, err := x509.CreateCertificate(rand.Reader, tmpl, signerCert, &key.PublicKey, signerKey)
	if err != nil {
		return nil, nil, nil, nil, err
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})

	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	return cert, key, certPEM, keyPEM, nil
}

func splitOrg(o string) []string {
	if o == "" {
		return nil
	}
	return strings.Split(o, ",")
}

// AllCertSpecs returns every certificate the tutorial requires, keyed by file name.
// nodeIPs maps node name (e.g. "node-0") to its real VM IP for SAN inclusion.
func AllCertSpecs(serverIP string, nodeIPs map[string]string) map[string]CertSpec {
	both := []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth, x509.ExtKeyUsageServerAuth}

	nodeSpec := func(name string) CertSpec {
		ips := []net.IP{net.ParseIP("127.0.0.1")}
		if ip, ok := nodeIPs[name]; ok && ip != "" {
			ips = append(ips, net.ParseIP(ip))
		}
		return CertSpec{
			CN: "system:node:" + name, O: "system:nodes",
			DNSNames: []string{name}, IPs: ips,
			ExtUsage: both,
		}
	}

	return map[string]CertSpec{
		"admin":  {CN: "admin", O: "system:masters"},
		"node-0": nodeSpec("node-0"),
		"node-1": nodeSpec("node-1"),
		"kube-proxy": {
			CN: "system:kube-proxy", O: "system:node-proxier",
			DNSNames: []string{"kube-proxy"}, IPs: []net.IP{net.ParseIP("127.0.0.1")},
			ExtUsage: both,
		},
		"kube-scheduler": {
			CN: "system:kube-scheduler", O: "system:kube-scheduler",
			DNSNames: []string{"kube-scheduler"}, IPs: []net.IP{net.ParseIP("127.0.0.1")},
			ExtUsage: both,
		},
		"kube-controller-manager": {
			CN: "system:kube-controller-manager", O: "system:kube-controller-manager",
			DNSNames: []string{"kube-controller-manager"}, IPs: []net.IP{net.ParseIP("127.0.0.1")},
			ExtUsage: both,
		},
		"kube-api-server": {
			CN: "kubernetes",
			DNSNames: []string{
				"kubernetes", "kubernetes.default", "kubernetes.default.svc",
				"kubernetes.default.svc.cluster", "kubernetes.svc.cluster.local",
				"server.kubernetes.local", "api-server.kubernetes.local",
			},
			IPs: []net.IP{
				net.ParseIP("127.0.0.1"),
				net.ParseIP("10.32.0.1"),
				net.ParseIP(serverIP),
			},
			ExtUsage: both,
		},
		"service-accounts": {CN: "service-accounts"},
	}
}

// GenerateAll creates the CA and all certs, returns a summary string.
func GenerateAll(dir, serverIP string, nodeIPs map[string]string) (*PKI, string, error) {
	pki, err := NewPKI(dir)
	if err != nil {
		return nil, "", err
	}

	specs := AllCertSpecs(serverIP, nodeIPs)
	order := []string{
		"admin", "node-0", "node-1", "kube-proxy",
		"kube-scheduler", "kube-controller-manager",
		"kube-api-server", "service-accounts",
	}

	var lines []string
	lines = append(lines, "ca.crt (self-signed CA)")
	for _, name := range order {
		if err := pki.Issue(name, specs[name]); err != nil {
			return nil, "", err
		}
		lines = append(lines, fmt.Sprintf("%s.crt (CN=%s)", name, specs[name].CN))
	}

	evidence := fmt.Sprintf("Generated %d certificates:\n%s", len(order)+1, strings.Join(lines, "\n"))
	return pki, evidence, nil
}
