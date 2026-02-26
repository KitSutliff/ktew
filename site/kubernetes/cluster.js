// ══════════════════════════════════════════════════
//  Kubernetes: The Reload — Virtual Cluster State
// ══════════════════════════════════════════════════

const CLUSTER = {
  currentNamespace: 'default',
  currentContext: 'kthw',

  contexts: {
    'kthw':       { cluster: 'kthw',       user: 'admin',    namespace: 'default' },
    'staging':    { cluster: 'staging-01',  user: 'deployer', namespace: 'staging' },
    'minikube':   { cluster: 'minikube',    user: 'minikube', namespace: 'default' },
  },

  nodes: {
    'server': {
      status: 'Ready', roles: 'control-plane', version: 'v1.32.1',
      internalIP: '10.240.0.10', os: 'linux/arm64', kernel: '6.1.0-28-arm64',
      cpu: '1', memory: '2048Mi', allocatable: { cpu: '940m', memory: '1536Mi' },
      conditions: ['Ready'],
      labels: { 'kubernetes.io/hostname': 'server', 'node-role.kubernetes.io/control-plane': '' },
      schedulable: true,
      metrics: { cpuUsage: '320m', memUsage: '1024Mi', cpuPercent: 34, memPercent: 66 },
    },
    'node-0': {
      status: 'Ready', roles: '<none>', version: 'v1.32.1',
      internalIP: '10.240.0.20', os: 'linux/arm64', kernel: '6.1.0-28-arm64',
      cpu: '1', memory: '2048Mi', allocatable: { cpu: '940m', memory: '1536Mi' },
      conditions: ['Ready'],
      labels: { 'kubernetes.io/hostname': 'node-0' },
      schedulable: true,
      metrics: { cpuUsage: '450m', memUsage: '1280Mi', cpuPercent: 47, memPercent: 83 },
    },
    'node-1': {
      status: 'Ready', roles: '<none>', version: 'v1.32.1',
      internalIP: '10.240.0.21', os: 'linux/arm64', kernel: '6.1.0-28-arm64',
      cpu: '1', memory: '2048Mi', allocatable: { cpu: '940m', memory: '1536Mi' },
      conditions: ['Ready'],
      labels: { 'kubernetes.io/hostname': 'node-1' },
      schedulable: true,
      metrics: { cpuUsage: '180m', memUsage: '640Mi', cpuPercent: 19, memPercent: 41 },
    },
  },

  namespaces: {
    'default':     { status: 'Active', labels: { 'kubernetes.io/metadata.name': 'default' } },
    'kube-system': { status: 'Active', labels: { 'kubernetes.io/metadata.name': 'kube-system' } },
    'kube-public': { status: 'Active', labels: { 'kubernetes.io/metadata.name': 'kube-public' } },
    'monitoring':  { status: 'Active', labels: { 'kubernetes.io/metadata.name': 'monitoring' } },
    'app':         { status: 'Active', labels: { 'kubernetes.io/metadata.name': 'app' } },
  },

  pods: {
    'kube-system': {
      'coredns-5dd5756b68-j4rnq': {
        status: 'Running', ready: '1/1', restarts: 0, age: '12d', node: 'server',
        ip: '10.200.0.2', image: 'registry.k8s.io/coredns/coredns:v1.11.3',
        containers: ['coredns'],
        labels: { 'k8s-app': 'kube-dns', 'pod-template-hash': '5dd5756b68' },
      },
      'etcd-server': {
        status: 'Running', ready: '1/1', restarts: 0, age: '12d', node: 'server',
        ip: '10.240.0.10', image: 'registry.k8s.io/etcd:3.5.15-0',
        containers: ['etcd'],
        labels: { 'component': 'etcd', 'tier': 'control-plane' },
      },
      'kube-apiserver-server': {
        status: 'Running', ready: '1/1', restarts: 0, age: '12d', node: 'server',
        ip: '10.240.0.10', image: 'registry.k8s.io/kube-apiserver:v1.32.1',
        containers: ['kube-apiserver'],
        labels: { 'component': 'kube-apiserver', 'tier': 'control-plane' },
      },
      'kube-controller-manager-server': {
        status: 'Running', ready: '1/1', restarts: 0, age: '12d', node: 'server',
        ip: '10.240.0.10', image: 'registry.k8s.io/kube-controller-manager:v1.32.1',
        containers: ['kube-controller-manager'],
        labels: { 'component': 'kube-controller-manager', 'tier': 'control-plane' },
      },
      'kube-scheduler-server': {
        status: 'Running', ready: '1/1', restarts: 0, age: '12d', node: 'server',
        ip: '10.240.0.10', image: 'registry.k8s.io/kube-scheduler:v1.32.1',
        containers: ['kube-scheduler'],
        labels: { 'component': 'kube-scheduler', 'tier': 'control-plane' },
      },
      'kube-proxy-7wqb4': {
        status: 'Running', ready: '1/1', restarts: 0, age: '12d', node: 'node-0',
        ip: '10.240.0.20', image: 'registry.k8s.io/kube-proxy:v1.32.1',
        containers: ['kube-proxy'],
        labels: { 'k8s-app': 'kube-proxy', 'controller-revision-hash': 'abcde123' },
      },
      'kube-proxy-m9x2l': {
        status: 'Running', ready: '1/1', restarts: 0, age: '12d', node: 'node-1',
        ip: '10.240.0.21', image: 'registry.k8s.io/kube-proxy:v1.32.1',
        containers: ['kube-proxy'],
        labels: { 'k8s-app': 'kube-proxy', 'controller-revision-hash': 'abcde123' },
      },
    },
    'default': {
      'webapp-6d8f7b4d9c-kx2rn': {
        status: 'Running', ready: '1/1', restarts: 0, age: '3d', node: 'node-0',
        ip: '10.200.1.5', image: 'nginx:1.25',
        containers: ['nginx'],
        labels: { 'app': 'webapp', 'pod-template-hash': '6d8f7b4d9c' },
      },
      'webapp-6d8f7b4d9c-p8tml': {
        status: 'Running', ready: '1/1', restarts: 0, age: '3d', node: 'node-1',
        ip: '10.200.2.3', image: 'nginx:1.25',
        containers: ['nginx'],
        labels: { 'app': 'webapp', 'pod-template-hash': '6d8f7b4d9c' },
      },
      'api-server-7f94cb6b58-zt4qw': {
        status: 'Running', ready: '1/1', restarts: 2, age: '5d', node: 'node-0',
        ip: '10.200.1.8', image: 'kit/api-server:v2.1.0',
        containers: ['api'],
        labels: { 'app': 'api-server', 'pod-template-hash': '7f94cb6b58', 'team': 'backend' },
      },
      'redis-master-0': {
        status: 'Running', ready: '1/1', restarts: 0, age: '7d', node: 'node-1',
        ip: '10.200.2.6', image: 'redis:7.2-alpine',
        containers: ['redis'],
        labels: { 'app': 'redis', 'role': 'master' },
      },
      'debug-pod': {
        status: 'CrashLoopBackOff', ready: '0/1', restarts: 47, age: '2d', node: 'node-0',
        ip: '10.200.1.12', image: 'busybox:1.36',
        containers: ['debugger'],
        labels: { 'app': 'debug', 'purpose': 'troubleshooting' },
        reason: 'CrashLoopBackOff',
        lastState: { terminated: { exitCode: 1, reason: 'Error' } },
      },
      'pending-pod': {
        status: 'Pending', ready: '0/1', restarts: 0, age: '6h', node: '<none>',
        ip: '<none>', image: 'nginx:1.25',
        containers: ['nginx'],
        labels: { 'app': 'pending-test' },
        reason: 'Unschedulable',
        conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable', message: 'Insufficient cpu' }],
      },
    },
    'monitoring': {
      'prometheus-server-0': {
        status: 'Running', ready: '2/2', restarts: 0, age: '10d', node: 'node-1',
        ip: '10.200.2.10', image: 'prom/prometheus:v2.51.0',
        containers: ['prometheus', 'config-reloader'],
        labels: { 'app': 'prometheus', 'component': 'server' },
      },
      'grafana-5c4f4d7b6f-r2d8k': {
        status: 'Running', ready: '1/1', restarts: 0, age: '10d', node: 'node-0',
        ip: '10.200.1.15', image: 'grafana/grafana:10.3.1',
        containers: ['grafana'],
        labels: { 'app': 'grafana', 'pod-template-hash': '5c4f4d7b6f' },
      },
    },
    'app': {
      'frontend-59b7d8c4f6-lm2wn': {
        status: 'Running', ready: '1/1', restarts: 0, age: '1d', node: 'node-0',
        ip: '10.200.1.20', image: 'kit/frontend:v3.0.0',
        containers: ['frontend'],
        labels: { 'app': 'frontend', 'tier': 'web', 'pod-template-hash': '59b7d8c4f6' },
      },
      'backend-api-6b7c8d9e0f-qr4st': {
        status: 'Running', ready: '2/2', restarts: 0, age: '1d', node: 'node-1',
        ip: '10.200.2.22', image: 'kit/backend:v2.5.0',
        containers: ['api', 'sidecar-proxy'],
        labels: { 'app': 'backend-api', 'tier': 'api', 'pod-template-hash': '6b7c8d9e0f' },
      },
      'worker-batch-xt9k2': {
        status: 'Completed', ready: '0/1', restarts: 0, age: '4h', node: 'node-1',
        ip: '10.200.2.25', image: 'kit/worker:v1.2.0',
        containers: ['worker'],
        labels: { 'app': 'worker', 'job-name': 'batch-process' },
      },
    },
  },

  deployments: {
    'default': {
      'webapp': {
        replicas: 2, ready: 2, upToDate: 2, available: 2, age: '3d',
        image: 'nginx:1.25', strategy: 'RollingUpdate',
        labels: { 'app': 'webapp' },
        selector: { 'app': 'webapp' },
        revisionHistory: [
          { revision: 1, image: 'nginx:1.24', change: 'Initial deployment' },
          { revision: 2, image: 'nginx:1.25', change: 'Updated to 1.25' },
        ],
      },
      'api-server': {
        replicas: 1, ready: 1, upToDate: 1, available: 1, age: '5d',
        image: 'kit/api-server:v2.1.0', strategy: 'RollingUpdate',
        labels: { 'app': 'api-server', 'team': 'backend' },
        selector: { 'app': 'api-server' },
        revisionHistory: [
          { revision: 1, image: 'kit/api-server:v2.0.0', change: 'Initial deployment' },
          { revision: 2, image: 'kit/api-server:v2.1.0', change: 'Bug fix release' },
        ],
      },
    },
    'app': {
      'frontend': {
        replicas: 1, ready: 1, upToDate: 1, available: 1, age: '1d',
        image: 'kit/frontend:v3.0.0', strategy: 'RollingUpdate',
        labels: { 'app': 'frontend', 'tier': 'web' },
        selector: { 'app': 'frontend' },
        revisionHistory: [
          { revision: 1, image: 'kit/frontend:v2.9.0', change: 'Initial deployment' },
          { revision: 2, image: 'kit/frontend:v3.0.0', change: 'Major UI overhaul' },
        ],
      },
      'backend-api': {
        replicas: 1, ready: 1, upToDate: 1, available: 1, age: '1d',
        image: 'kit/backend:v2.5.0', strategy: 'RollingUpdate',
        labels: { 'app': 'backend-api', 'tier': 'api' },
        selector: { 'app': 'backend-api' },
        revisionHistory: [
          { revision: 1, image: 'kit/backend:v2.4.0', change: 'Initial deployment' },
          { revision: 2, image: 'kit/backend:v2.5.0', change: 'Added caching layer' },
        ],
      },
    },
    'monitoring': {},
  },

  services: {
    'default': {
      'kubernetes': {
        type: 'ClusterIP', clusterIP: '10.32.0.1', ports: '443/TCP',
        externalIP: '<none>', age: '12d',
        selector: null,
        labels: { 'component': 'apiserver', 'provider': 'kubernetes' },
      },
      'webapp-svc': {
        type: 'NodePort', clusterIP: '10.32.0.45', ports: '80:30080/TCP',
        externalIP: '<none>', age: '3d',
        selector: { 'app': 'webapp' },
        labels: { 'app': 'webapp' },
        nodePort: 30080,
      },
      'api-server-svc': {
        type: 'ClusterIP', clusterIP: '10.32.0.88', ports: '8080/TCP',
        externalIP: '<none>', age: '5d',
        selector: { 'app': 'api-server' },
        labels: { 'app': 'api-server' },
      },
      'redis-svc': {
        type: 'ClusterIP', clusterIP: '10.32.0.112', ports: '6379/TCP',
        externalIP: '<none>', age: '7d',
        selector: { 'app': 'redis', 'role': 'master' },
        labels: { 'app': 'redis' },
      },
    },
    'monitoring': {
      'prometheus-svc': {
        type: 'ClusterIP', clusterIP: '10.32.0.150', ports: '9090/TCP',
        externalIP: '<none>', age: '10d',
        selector: { 'app': 'prometheus' },
        labels: { 'app': 'prometheus' },
      },
      'grafana-svc': {
        type: 'NodePort', clusterIP: '10.32.0.155', ports: '3000:30300/TCP',
        externalIP: '<none>', age: '10d',
        selector: { 'app': 'grafana' },
        labels: { 'app': 'grafana' },
        nodePort: 30300,
      },
    },
    'app': {
      'frontend-svc': {
        type: 'LoadBalancer', clusterIP: '10.32.0.200', ports: '80:31080/TCP',
        externalIP: '192.168.88.100', age: '1d',
        selector: { 'app': 'frontend' },
        labels: { 'app': 'frontend' },
      },
      'backend-api-svc': {
        type: 'ClusterIP', clusterIP: '10.32.0.210', ports: '8080/TCP',
        externalIP: '<none>', age: '1d',
        selector: { 'app': 'backend-api' },
        labels: { 'app': 'backend-api' },
      },
    },
    'kube-system': {
      'kube-dns': {
        type: 'ClusterIP', clusterIP: '10.32.0.10', ports: '53/UDP,53/TCP,9153/TCP',
        externalIP: '<none>', age: '12d',
        selector: { 'k8s-app': 'kube-dns' },
        labels: { 'k8s-app': 'kube-dns' },
      },
    },
  },

  configmaps: {
    'default': {
      'webapp-config': {
        data: { 'LOG_LEVEL': 'info', 'PORT': '8080', 'DB_HOST': 'redis-svc' },
        age: '3d',
        labels: { 'app': 'webapp' },
      },
    },
    'kube-system': {
      'coredns': {
        data: { 'Corefile': '.:53 {\n    errors\n    health\n    kubernetes cluster.local\n    forward . /etc/resolv.conf\n    cache 30\n}' },
        age: '12d',
        labels: {},
      },
    },
    'monitoring': {},
    'app': {
      'app-config': {
        data: { 'API_URL': 'http://backend-api-svc:8080', 'CACHE_TTL': '300', 'ENV': 'production' },
        age: '1d',
        labels: { 'tier': 'config' },
      },
    },
  },

  secrets: {
    'default': {
      'redis-auth': {
        type: 'Opaque', dataKeys: ['password'], age: '7d',
        labels: { 'app': 'redis' },
      },
      'default-token-abc12': {
        type: 'kubernetes.io/service-account-token', dataKeys: ['ca.crt', 'namespace', 'token'], age: '12d',
        labels: {},
      },
    },
    'kube-system': {},
    'monitoring': {},
    'app': {
      'backend-db-creds': {
        type: 'Opaque', dataKeys: ['username', 'password', 'connection-string'], age: '1d',
        labels: { 'app': 'backend-api' },
      },
    },
  },

  events: [
    { namespace: 'default', age: '6h', type: 'Warning', reason: 'FailedScheduling', object: 'pod/pending-pod', message: '0/3 nodes are available: 1 node(s) had untolerated taint, 2 Insufficient cpu.' },
    { namespace: 'default', age: '2m', type: 'Warning', reason: 'BackOff', object: 'pod/debug-pod', message: 'Back-off restarting failed container debugger in pod debug-pod' },
    { namespace: 'default', age: '3d', type: 'Normal', reason: 'Scheduled', object: 'pod/webapp-6d8f7b4d9c-kx2rn', message: 'Successfully assigned default/webapp-6d8f7b4d9c-kx2rn to node-0' },
    { namespace: 'default', age: '3d', type: 'Normal', reason: 'Pulled', object: 'pod/webapp-6d8f7b4d9c-kx2rn', message: 'Container image "nginx:1.25" already present on machine' },
    { namespace: 'default', age: '3d', type: 'Normal', reason: 'Started', object: 'pod/webapp-6d8f7b4d9c-kx2rn', message: 'Started container nginx' },
    { namespace: 'default', age: '5d', type: 'Warning', reason: 'Unhealthy', object: 'pod/api-server-7f94cb6b58-zt4qw', message: 'Liveness probe failed: HTTP probe failed with statuscode: 503' },
    { namespace: 'monitoring', age: '10d', type: 'Normal', reason: 'Scheduled', object: 'pod/prometheus-server-0', message: 'Successfully assigned monitoring/prometheus-server-0 to node-1' },
    { namespace: 'app', age: '1d', type: 'Normal', reason: 'ScalingReplicaSet', object: 'deployment/frontend', message: 'Scaled up replica set frontend-59b7d8c4f6 to 1' },
  ],

  logs: {
    'webapp-6d8f7b4d9c-kx2rn': {
      'nginx': [
        '2026/02/23 10:00:01 [notice] 1#1: nginx/1.25.4',
        '2026/02/23 10:00:01 [notice] 1#1: built by gcc 12.2.0',
        '2026/02/23 10:00:01 [notice] 1#1: using OpenSSL 3.0.13',
        '2026/02/23 10:00:01 [notice] 1#1: start worker processes',
        '192.168.1.10 - - [23/Feb/2026:10:05:00] "GET / HTTP/1.1" 200 615',
        '192.168.1.10 - - [23/Feb/2026:10:05:01] "GET /style.css HTTP/1.1" 200 1024',
        '10.200.1.1 - - [23/Feb/2026:10:10:00] "GET /healthz HTTP/1.1" 200 2',
        '192.168.1.20 - - [23/Feb/2026:10:15:00] "GET /api HTTP/1.1" 502 150',
        '10.200.1.1 - - [23/Feb/2026:10:20:00] "GET /healthz HTTP/1.1" 200 2',
      ],
    },
    'webapp-6d8f7b4d9c-p8tml': {
      'nginx': [
        '2026/02/23 10:00:02 [notice] 1#1: nginx/1.25.4',
        '2026/02/23 10:00:02 [notice] 1#1: start worker processes',
        '10.200.2.1 - - [23/Feb/2026:10:10:00] "GET /healthz HTTP/1.1" 200 2',
        '10.200.2.1 - - [23/Feb/2026:10:20:00] "GET /healthz HTTP/1.1" 200 2',
      ],
    },
    'api-server-7f94cb6b58-zt4qw': {
      'api': [
        '[INFO]  2026-02-23T10:00:01Z Starting api-server v2.1.0',
        '[INFO]  2026-02-23T10:00:02Z Connected to redis at redis-svc:6379',
        '[INFO]  2026-02-23T10:00:02Z Listening on :8080',
        '[WARN]  2026-02-23T10:01:15Z Slow query: GET /api/users took 2340ms',
        '[ERROR] 2026-02-23T10:02:44Z Redis connection lost: dial tcp 10.32.0.112:6379: connect: connection refused',
        '[INFO]  2026-02-23T10:03:00Z Reconnected to redis',
        '[ERROR] 2026-02-23T10:04:15Z Panic recovered: runtime error: nil pointer dereference',
        '[INFO]  2026-02-23T10:05:00Z Health check: OK',
        '[WARN]  2026-02-23T10:06:30Z Memory usage at 89% - consider increasing limits',
        '[ERROR] 2026-02-23T10:07:22Z Redis connection lost: dial tcp 10.32.0.112:6379: connect: connection refused',
      ],
    },
    'redis-master-0': {
      'redis': [
        '1:C 23 Feb 2026 10:00:00.000 # oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo',
        '1:C 23 Feb 2026 10:00:00.001 # Redis version=7.2.4, bits=64, commit=00000000',
        '1:M 23 Feb 2026 10:00:00.002 * Ready to accept connections tcp',
        '1:M 23 Feb 2026 10:01:15.000 # Client closed connection',
        '1:M 23 Feb 2026 10:05:00.000 * 1 changes in 300 seconds. Saving...',
        '1:M 23 Feb 2026 10:05:00.001 * Background saving started',
        '1:M 23 Feb 2026 10:05:00.050 * Background saving terminated with success',
      ],
    },
    'debug-pod': {
      'debugger': [
        'Starting debug session...',
        'Error: no configuration file found at /etc/debug/config.yaml',
        'Exiting with code 1',
      ],
      '__previous__debugger': [
        'Starting debug session...',
        'Error: no configuration file found at /etc/debug/config.yaml',
        'Exiting with code 1',
      ],
    },
    'coredns-5dd5756b68-j4rnq': {
      'coredns': [
        '.:53',
        '[INFO] plugin/reload: Running configuration SHA512 = abc123def456',
        'CoreDNS-1.11.3',
        'linux/arm64, go1.22.0',
      ],
    },
    'prometheus-server-0': {
      'prometheus': [
        'ts=2026-02-23T10:00:01Z caller=main.go:542 level=info msg="Starting Prometheus Server" version="2.51.0"',
        'ts=2026-02-23T10:00:01Z caller=main.go:545 level=info build_context="(go=go1.22.0, platform=linux/arm64)"',
        'ts=2026-02-23T10:00:02Z caller=main.go:1200 level=info msg="Completed loading of configuration file"',
        'ts=2026-02-23T10:00:02Z caller=main.go:993 level=info msg="Server is ready to receive web requests."',
      ],
      'config-reloader': [
        'level=info ts=2026-02-23T10:00:01Z msg="Starting config-reloader"',
        'level=info ts=2026-02-23T10:00:01Z msg="Watching /etc/prometheus/prometheus.yml"',
      ],
    },
    'grafana-5c4f4d7b6f-r2d8k': {
      'grafana': [
        'logger=settings t=2026-02-23T10:00:01Z level=info msg="Starting Grafana" version=10.3.1',
        'logger=server t=2026-02-23T10:00:02Z level=info msg="HTTP Server Listen" address=[::]:3000',
      ],
    },
    'frontend-59b7d8c4f6-lm2wn': {
      'frontend': [
        'Starting frontend v3.0.0',
        'Serving on :80',
        'GET / 200 12ms',
        'GET /static/bundle.js 200 3ms',
      ],
    },
    'backend-api-6b7c8d9e0f-qr4st': {
      'api': [
        '[INFO]  Starting backend-api v2.5.0',
        '[INFO]  Connected to database',
        '[INFO]  Cache layer initialized (TTL=300s)',
        '[INFO]  Listening on :8080',
      ],
      'sidecar-proxy': [
        'envoy initializing...',
        'all clusters healthy',
        'listener 0.0.0.0:15001 ready',
      ],
    },
  },

  yamlFiles: {
    'nginx-pod.yaml': {
      kind: 'Pod', apiVersion: 'v1',
      metadata: { name: 'nginx-test', namespace: 'default', labels: { app: 'nginx-test' } },
      spec: { containers: [{ name: 'nginx', image: 'nginx:1.25', ports: [{ containerPort: 80 }] }] },
    },
    'redis-deploy.yaml': {
      kind: 'Deployment', apiVersion: 'apps/v1',
      metadata: { name: 'redis-replica', namespace: 'default', labels: { app: 'redis-replica' } },
      spec: {
        replicas: 2,
        selector: { matchLabels: { app: 'redis-replica' } },
        template: {
          metadata: { labels: { app: 'redis-replica' } },
          spec: { containers: [{ name: 'redis', image: 'redis:7.2-alpine', ports: [{ containerPort: 6379 }] }] },
        },
      },
    },
  },
};

// ─── Pod Metrics (simulated top) ─────────────────

const POD_METRICS = {
  'kube-system': {
    'coredns-5dd5756b68-j4rnq':            { cpu: '8m',   memory: '24Mi' },
    'etcd-server':                          { cpu: '45m',  memory: '128Mi' },
    'kube-apiserver-server':                { cpu: '120m', memory: '320Mi' },
    'kube-controller-manager-server':       { cpu: '30m',  memory: '64Mi' },
    'kube-scheduler-server':                { cpu: '15m',  memory: '32Mi' },
    'kube-proxy-7wqb4':                     { cpu: '3m',   memory: '18Mi' },
    'kube-proxy-m9x2l':                     { cpu: '3m',   memory: '18Mi' },
  },
  'default': {
    'webapp-6d8f7b4d9c-kx2rn':             { cpu: '12m',  memory: '48Mi' },
    'webapp-6d8f7b4d9c-p8tml':             { cpu: '10m',  memory: '45Mi' },
    'api-server-7f94cb6b58-zt4qw':         { cpu: '85m',  memory: '256Mi' },
    'redis-master-0':                       { cpu: '25m',  memory: '64Mi' },
    'debug-pod':                            { cpu: '0m',   memory: '0Mi' },
    'pending-pod':                          { cpu: '0m',   memory: '0Mi' },
  },
  'monitoring': {
    'prometheus-server-0':                  { cpu: '95m',  memory: '512Mi' },
    'grafana-5c4f4d7b6f-r2d8k':            { cpu: '20m',  memory: '128Mi' },
  },
  'app': {
    'frontend-59b7d8c4f6-lm2wn':           { cpu: '15m',  memory: '64Mi' },
    'backend-api-6b7c8d9e0f-qr4st':        { cpu: '50m',  memory: '192Mi' },
    'worker-batch-xt9k2':                   { cpu: '0m',   memory: '0Mi' },
  },
};

// ─── Backup / Reset ──────────────────────────────

let CLUSTER_BACKUP = null;

function backupCluster() {
  CLUSTER_BACKUP = JSON.parse(JSON.stringify(CLUSTER));
}

function resetCluster() {
  if (!CLUSTER_BACKUP) return;
  const backup = JSON.parse(JSON.stringify(CLUSTER_BACKUP));
  Object.keys(CLUSTER).forEach(k => delete CLUSTER[k]);
  Object.assign(CLUSTER, backup);
}
