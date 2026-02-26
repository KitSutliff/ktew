// ══════════════════════════════════════════════════
//  Kubernetes: The Reload — kubectl Command Engine
// ══════════════════════════════════════════════════

function parseKubectlArgs(args) {
  const parsed = { flags: {}, positional: [], namespace: null, allNamespaces: false, output: null, labels: null, sortBy: null, tail: null, container: null, previous: false, filename: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-n' || a === '--namespace') { parsed.namespace = args[++i]; }
    else if (a === '-A' || a === '--all-namespaces') { parsed.allNamespaces = true; }
    else if (a === '-o' || a === '--output') { parsed.output = args[++i]; }
    else if (a.startsWith('-o=')) { parsed.output = a.slice(3); }
    else if (a.startsWith('-o') && a.length > 2) { parsed.output = a.slice(2); }
    else if (a === '-l' || a === '--selector') { parsed.labels = args[++i]; }
    else if (a.startsWith('-l=') || a.startsWith('-l')) {
      if (a === '-l') parsed.labels = args[++i];
      else parsed.labels = a.slice(2).replace(/^=/, '');
    }
    else if (a === '--sort-by') { parsed.sortBy = args[++i]; }
    else if (a === '--tail') { parsed.tail = parseInt(args[++i]); }
    else if (a === '-c' || a === '--container') { parsed.container = args[++i]; }
    else if (a === '--previous' || a === '-p') { parsed.previous = true; }
    else if (a === '-f' || a === '--filename') { parsed.filename = args[++i]; }
    else if (a.startsWith('-f=')) { parsed.filename = a.slice(3); }
    else if (a === '--replicas') { parsed.flags.replicas = parseInt(args[++i]); }
    else if (a.startsWith('--replicas=')) { parsed.flags.replicas = parseInt(a.split('=')[1]); }
    else if (a === '--image') { parsed.flags.image = args[++i]; }
    else if (a.startsWith('--image=')) { parsed.flags.image = a.split('=')[1]; }
    else if (a === '--port') { parsed.flags.port = args[++i]; }
    else if (a.startsWith('--port=')) { parsed.flags.port = a.split('=')[1]; }
    else if (a === '--type') { parsed.flags.type = args[++i]; }
    else if (a.startsWith('--type=')) { parsed.flags.type = a.split('=')[1]; }
    else if (a === '--target-port') { parsed.flags.targetPort = args[++i]; }
    else if (a.startsWith('--target-port=')) { parsed.flags.targetPort = a.split('=')[1]; }
    else if (a === '--') { continue; }
    else if (a === '--force' || a === '--grace-period=0' || a === '--ignore-daemonsets' || a === '--delete-emptydir-data') { parsed.flags[a.replace(/^--/, '').replace(/=.*/, '')] = true; }
    else if (a.startsWith('-') && !a.startsWith('--')) {
      for (let c = 1; c < a.length; c++) {
        if (a[c] === 'w') parsed.output = 'wide';
        if (a[c] === 'A') parsed.allNamespaces = true;
      }
    }
    else { parsed.positional.push(a); }
  }
  return parsed;
}

function pad(str, len) { str = String(str); return str + ' '.repeat(Math.max(0, len - str.length)); }

function matchLabels(podLabels, selector) {
  if (!selector) return true;
  const pairs = selector.split(',');
  for (const pair of pairs) {
    const [k, v] = pair.split('=');
    if (podLabels[k] !== v) return false;
  }
  return true;
}

function getNs(parsed) {
  return parsed.namespace || CLUSTER.currentNamespace;
}

// ─── kubectl get ─────────────────────────────────

function kubectlGet(parsed) {
  const resource = parsed.positional[0];
  const name = parsed.positional[1];
  if (!resource) return 'error: You must specify the type of resource to get.';

  const ns = getNs(parsed);
  const wide = parsed.output === 'wide';
  const yaml = parsed.output === 'yaml';

  switch (resource) {
    case 'nodes': case 'node': case 'no':
      return getNodes(name, wide, yaml);
    case 'pods': case 'pod': case 'po':
      return getPods(ns, name, wide, yaml, parsed);
    case 'services': case 'service': case 'svc':
      return getServices(ns, name, wide, yaml, parsed);
    case 'deployments': case 'deployment': case 'deploy':
      return getDeployments(ns, name, wide, yaml, parsed);
    case 'namespaces': case 'namespace': case 'ns':
      return getNamespaces(name, yaml);
    case 'configmaps': case 'configmap': case 'cm':
      return getConfigMaps(ns, name, yaml, parsed);
    case 'secrets': case 'secret':
      return getSecrets(ns, name, yaml, parsed);
    case 'events': case 'event': case 'ev':
      return getEvents(ns, parsed);
    case 'all':
      return getAll(ns, wide, parsed);
    default:
      return `error: the server doesn't have a resource type "${resource}"`;
  }
}

function getNodes(name, wide, yaml) {
  if (name) {
    const n = CLUSTER.nodes[name];
    if (!n) return `Error from server (NotFound): nodes "${name}" not found`;
    if (yaml) return nodeToYaml(name, n);
    return formatNodeTable([{ name, ...n }], wide);
  }
  const rows = Object.entries(CLUSTER.nodes).map(([name, n]) => ({ name, ...n }));
  return formatNodeTable(rows, wide);
}

function formatNodeTable(rows, wide) {
  let header = pad('NAME', 12) + pad('STATUS', 16) + pad('ROLES', 18) + pad('AGE', 8) + 'VERSION';
  if (wide) header += '   ' + pad('INTERNAL-IP', 16) + pad('OS-IMAGE', 14) + 'KERNEL-VERSION';
  const lines = [header];
  for (const r of rows) {
    const status = r.schedulable ? r.status : 'Ready,SchedulingDisabled';
    let line = pad(r.name, 12) + pad(status, 16) + pad(r.roles, 18) + pad(r.age || '12d', 8) + r.version;
    if (wide) line += '   ' + pad(r.internalIP, 16) + pad('Debian GNU/Linux', 14) + r.kernel;
    lines.push(line);
  }
  return lines.join('\n');
}

function getPods(ns, name, wide, yaml, parsed) {
  if (parsed.allNamespaces) {
    const rows = [];
    for (const [namespace, pods] of Object.entries(CLUSTER.pods)) {
      for (const [pname, p] of Object.entries(pods)) {
        if (parsed.labels && !matchLabels(p.labels, parsed.labels)) continue;
        rows.push({ namespace, name: pname, ...p });
      }
    }
    if (rows.length === 0) return 'No resources found';
    return formatPodTable(rows, wide, true);
  }
  const nsPods = CLUSTER.pods[ns];
  if (!nsPods) return `No resources found in ${ns} namespace.`;
  if (name) {
    const p = nsPods[name];
    if (!p) return `Error from server (NotFound): pods "${name}" not found`;
    if (yaml) return podToYaml(name, p, ns);
    return formatPodTable([{ name, ...p }], wide, false);
  }
  const rows = [];
  for (const [pname, p] of Object.entries(nsPods)) {
    if (parsed.labels && !matchLabels(p.labels, parsed.labels)) continue;
    rows.push({ name: pname, ...p });
  }
  if (rows.length === 0) return 'No resources found in ' + ns + ' namespace.';
  return formatPodTable(rows, wide, false);
}

function formatPodTable(rows, wide, showNs) {
  let header = '';
  if (showNs) header += pad('NAMESPACE', 14);
  header += pad('NAME', 44) + pad('READY', 8) + pad('STATUS', 22) + pad('RESTARTS', 11) + 'AGE';
  if (wide) header += '   ' + pad('IP', 16) + pad('NODE', 10);
  const lines = [header];
  for (const r of rows) {
    let line = '';
    if (showNs) line += pad(r.namespace, 14);
    line += pad(r.name, 44) + pad(r.ready, 8) + pad(r.status, 22) + pad(String(r.restarts), 11) + r.age;
    if (wide) line += '   ' + pad(r.ip || '<none>', 16) + pad(r.node || '<none>', 10);
    lines.push(line);
  }
  return lines.join('\n');
}

function getServices(ns, name, wide, yaml, parsed) {
  if (parsed.allNamespaces) {
    const rows = [];
    for (const [namespace, svcs] of Object.entries(CLUSTER.services)) {
      for (const [sname, s] of Object.entries(svcs)) {
        rows.push({ namespace, name: sname, ...s });
      }
    }
    return formatServiceTable(rows, wide, true);
  }
  const nsSvcs = CLUSTER.services[ns] || {};
  if (name) {
    const s = nsSvcs[name];
    if (!s) return `Error from server (NotFound): services "${name}" not found`;
    return formatServiceTable([{ name, ...s }], wide, false);
  }
  const rows = Object.entries(nsSvcs).map(([n, s]) => ({ name: n, ...s }));
  if (rows.length === 0) return 'No resources found in ' + ns + ' namespace.';
  return formatServiceTable(rows, wide, false);
}

function formatServiceTable(rows, wide, showNs) {
  let header = '';
  if (showNs) header += pad('NAMESPACE', 14);
  header += pad('NAME', 22) + pad('TYPE', 16) + pad('CLUSTER-IP', 16) + pad('EXTERNAL-IP', 20) + pad('PORT(S)', 22) + 'AGE';
  const lines = [header];
  for (const r of rows) {
    let line = '';
    if (showNs) line += pad(r.namespace, 14);
    line += pad(r.name, 22) + pad(r.type, 16) + pad(r.clusterIP, 16) + pad(r.externalIP || '<none>', 20) + pad(r.ports, 22) + r.age;
    lines.push(line);
  }
  return lines.join('\n');
}

function getDeployments(ns, name, wide, yaml, parsed) {
  if (parsed.allNamespaces) {
    const rows = [];
    for (const [namespace, deps] of Object.entries(CLUSTER.deployments)) {
      for (const [dname, d] of Object.entries(deps)) {
        rows.push({ namespace, name: dname, ...d });
      }
    }
    return formatDeploymentTable(rows, wide, true);
  }
  const nsDeps = CLUSTER.deployments[ns] || {};
  if (name) {
    const d = nsDeps[name];
    if (!d) return `Error from server (NotFound): deployments.apps "${name}" not found`;
    return formatDeploymentTable([{ name, ...d }], wide, false);
  }
  const rows = Object.entries(nsDeps).map(([n, d]) => ({ name: n, ...d }));
  if (rows.length === 0) return 'No resources found in ' + ns + ' namespace.';
  return formatDeploymentTable(rows, wide, false);
}

function formatDeploymentTable(rows, wide, showNs) {
  let header = '';
  if (showNs) header += pad('NAMESPACE', 14);
  header += pad('NAME', 22) + pad('READY', 10) + pad('UP-TO-DATE', 14) + pad('AVAILABLE', 12) + 'AGE';
  if (wide) header += '   IMAGES';
  const lines = [header];
  for (const r of rows) {
    let line = '';
    if (showNs) line += pad(r.namespace, 14);
    line += pad(r.name, 22) + pad(`${r.ready}/${r.replicas}`, 10) + pad(String(r.upToDate), 14) + pad(String(r.available), 12) + r.age;
    if (wide) line += '   ' + (r.image || '');
    lines.push(line);
  }
  return lines.join('\n');
}

function getNamespaces(name, yaml) {
  if (name) {
    const n = CLUSTER.namespaces[name];
    if (!n) return `Error from server (NotFound): namespaces "${name}" not found`;
    return formatNamespaceTable([{ name, ...n }]);
  }
  const rows = Object.entries(CLUSTER.namespaces).map(([n, ns]) => ({ name: n, ...ns }));
  return formatNamespaceTable(rows);
}

function formatNamespaceTable(rows) {
  const lines = [pad('NAME', 18) + pad('STATUS', 10) + 'AGE'];
  for (const r of rows) {
    lines.push(pad(r.name, 18) + pad(r.status, 10) + '12d');
  }
  return lines.join('\n');
}

function getConfigMaps(ns, name, yaml, parsed) {
  const nsCMs = CLUSTER.configmaps[ns] || {};
  if (name) {
    const cm = nsCMs[name];
    if (!cm) return `Error from server (NotFound): configmaps "${name}" not found`;
    if (yaml) return configMapToYaml(name, cm, ns);
    return formatConfigMapTable([{ name, ...cm }]);
  }
  const rows = Object.entries(nsCMs).map(([n, cm]) => ({ name: n, ...cm }));
  if (rows.length === 0) return 'No resources found in ' + ns + ' namespace.';
  return formatConfigMapTable(rows);
}

function formatConfigMapTable(rows) {
  const lines = [pad('NAME', 24) + pad('DATA', 8) + 'AGE'];
  for (const r of rows) {
    const dataCount = r.data ? Object.keys(r.data).length : 0;
    lines.push(pad(r.name, 24) + pad(String(dataCount), 8) + r.age);
  }
  return lines.join('\n');
}

function getSecrets(ns, name, yaml, parsed) {
  const nsSecrets = CLUSTER.secrets[ns] || {};
  if (name) {
    const s = nsSecrets[name];
    if (!s) return `Error from server (NotFound): secrets "${name}" not found`;
    return formatSecretTable([{ name, ...s }]);
  }
  const rows = Object.entries(nsSecrets).map(([n, s]) => ({ name: n, ...s }));
  if (rows.length === 0) return 'No resources found in ' + ns + ' namespace.';
  return formatSecretTable(rows);
}

function formatSecretTable(rows) {
  const lines = [pad('NAME', 32) + pad('TYPE', 40) + pad('DATA', 8) + 'AGE'];
  for (const r of rows) {
    const dataCount = r.dataKeys ? r.dataKeys.length : 0;
    lines.push(pad(r.name, 32) + pad(r.type, 40) + pad(String(dataCount), 8) + r.age);
  }
  return lines.join('\n');
}

function getEvents(ns, parsed) {
  let events = CLUSTER.events;
  if (!parsed.allNamespaces) events = events.filter(e => e.namespace === ns);
  if (events.length === 0) return 'No events found.';
  const lines = [pad('NAMESPACE', 14) + pad('LAST SEEN', 10) + pad('TYPE', 10) + pad('REASON', 22) + pad('OBJECT', 44) + 'MESSAGE'];
  for (const e of events) {
    lines.push(pad(e.namespace, 14) + pad(e.age, 10) + pad(e.type, 10) + pad(e.reason, 22) + pad(e.object, 44) + e.message);
  }
  return lines.join('\n');
}

function getAll(ns, wide, parsed) {
  const parts = [];
  const nsPods = CLUSTER.pods[ns];
  if (nsPods && Object.keys(nsPods).length > 0) {
    const rows = Object.entries(nsPods).map(([n, p]) => ({ name: n, ...p }));
    parts.push(formatPodTable(rows, wide, false));
  }
  const nsSvcs = CLUSTER.services[ns] || {};
  if (Object.keys(nsSvcs).length > 0) {
    const rows = Object.entries(nsSvcs).map(([n, s]) => ({ name: n, ...s }));
    parts.push(formatServiceTable(rows, wide, false));
  }
  const nsDeps = CLUSTER.deployments[ns] || {};
  if (Object.keys(nsDeps).length > 0) {
    const rows = Object.entries(nsDeps).map(([n, d]) => ({ name: n, ...d }));
    parts.push(formatDeploymentTable(rows, wide, false));
  }
  if (parts.length === 0) return 'No resources found in ' + ns + ' namespace.';
  return parts.join('\n\n');
}

// ─── kubectl describe ────────────────────────────

function kubectlDescribe(parsed) {
  const resource = parsed.positional[0];
  const name = parsed.positional[1];
  if (!resource) return 'error: You must specify the type of resource to describe.';
  if (!name) return `error: You must specify the name of the ${resource} to describe.`;
  const ns = getNs(parsed);

  switch (resource) {
    case 'node': case 'nodes': case 'no':
      return describeNode(name);
    case 'pod': case 'pods': case 'po':
      return describePod(name, ns);
    case 'service': case 'services': case 'svc':
      return describeService(name, ns);
    case 'deployment': case 'deployments': case 'deploy':
      return describeDeployment(name, ns);
    default:
      return `error: the server doesn't have a resource type "${resource}"`;
  }
}

function describeNode(name) {
  const n = CLUSTER.nodes[name];
  if (!n) return `Error from server (NotFound): nodes "${name}" not found`;
  const labels = Object.entries(n.labels).map(([k, v]) => v ? `${k}=${v}` : k).join('\n                    ');
  return `Name:               ${name}
Roles:              ${n.roles}
Labels:             ${labels}
Taints:             ${name === 'server' ? 'node-role.kubernetes.io/control-plane:NoSchedule' : '<none>'}
CreationTimestamp:  Mon, 11 Feb 2026 10:00:00 -0800
Conditions:
  Type    Status  Reason                  Message
  ----    ------  ------                  -------
  Ready   True    KubeletReady            kubelet is posting ready status
Addresses:
  InternalIP:  ${n.internalIP}
  Hostname:    ${name}
Capacity:
  cpu:     ${n.cpu}
  memory:  ${n.memory}
Allocatable:
  cpu:     ${n.allocatable.cpu}
  memory:  ${n.allocatable.memory}
System Info:
  OS Image:            Debian GNU/Linux 12 (bookworm)
  Kernel Version:      ${n.kernel}
  Container Runtime:   containerd://2.1.0
  Kubelet Version:     ${n.version}`;
}

function describePod(name, ns) {
  const nsPods = CLUSTER.pods[ns];
  if (!nsPods || !nsPods[name]) return `Error from server (NotFound): pods "${name}" not found`;
  const p = nsPods[name];
  const labels = Object.entries(p.labels).map(([k, v]) => `${k}=${v}`).join('\n           ');
  let conditions = '';
  if (p.conditions) {
    conditions = '\nConditions:\n  Type           Status\n  ----           ------\n';
    for (const c of p.conditions) {
      conditions += `  ${pad(c.type, 15)}${c.status}\n`;
      if (c.message) conditions += `    Message: ${c.message}\n`;
    }
  }
  let lastState = '';
  if (p.lastState && p.lastState.terminated) {
    lastState = `\n    Last State:   Terminated\n      Reason:     ${p.lastState.terminated.reason}\n      Exit Code:  ${p.lastState.terminated.exitCode}`;
  }
  const events = CLUSTER.events.filter(e => e.object.includes(name) && e.namespace === ns);
  let eventsStr = 'Events:  <none>';
  if (events.length > 0) {
    eventsStr = 'Events:\n  Type     Reason            Age   Message\n  ----     ------            ----  -------\n';
    for (const e of events) {
      eventsStr += `  ${pad(e.type, 9)}${pad(e.reason, 18)}${pad(e.age, 6)}${e.message}\n`;
    }
  }
  return `Name:         ${name}
Namespace:    ${ns}
Node:         ${p.node || '<none>'}/${p.ip || ''}
Status:       ${p.status}
IP:           ${p.ip || '<none>'}
Labels:       ${labels}
Containers:
  ${p.containers[0]}:
    Image:        ${p.image}
    State:        ${p.status === 'Running' ? 'Running' : (p.status === 'CrashLoopBackOff' ? 'Waiting\n      Reason: CrashLoopBackOff' : (p.status === 'Pending' ? 'Waiting\n      Reason: ContainerCreating' : p.status))}${lastState}
    Ready:        ${p.ready.startsWith('0') ? 'False' : 'True'}
    Restart Count: ${p.restarts}${conditions}
${eventsStr}`;
}

function describeService(name, ns) {
  const nsSvcs = CLUSTER.services[ns] || {};
  const s = nsSvcs[name];
  if (!s) return `Error from server (NotFound): services "${name}" not found`;
  const selectorStr = s.selector ? Object.entries(s.selector).map(([k, v]) => `${k}=${v}`).join(',') : '<none>';
  let nodePortLine = '';
  if (s.nodePort) nodePortLine = `\nNodePort:         <unset>  ${s.nodePort}/TCP`;
  return `Name:             ${name}
Namespace:        ${ns}
Labels:           ${Object.entries(s.labels || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Selector:         ${selectorStr}
Type:             ${s.type}
IP:               ${s.clusterIP}${nodePortLine}
Port:             <unset>  ${s.ports}
Endpoints:        <endpoints>
Session Affinity: None`;
}

function describeDeployment(name, ns) {
  const nsDeps = CLUSTER.deployments[ns] || {};
  const d = nsDeps[name];
  if (!d) return `Error from server (NotFound): deployments.apps "${name}" not found`;
  const selectorStr = Object.entries(d.selector).map(([k, v]) => `${k}=${v}`).join(',');
  return `Name:               ${name}
Namespace:          ${ns}
Selector:           ${selectorStr}
Replicas:           ${d.ready} available | ${d.replicas} desired | ${d.upToDate} updated | ${d.replicas} total
StrategyType:       ${d.strategy}
Pod Template:
  Labels:  ${Object.entries(d.labels).map(([k, v]) => `${k}=${v}`).join(', ')}
  Containers:
   container:
    Image:  ${d.image}
Conditions:
  Type           Status  Reason
  ----           ------  ------
  Available      True    MinimumReplicasAvailable
  Progressing    True    NewReplicaSetAvailable`;
}

// ─── kubectl logs ────────────────────────────────

function kubectlLogs(parsed) {
  const name = parsed.positional[0];
  if (!name) return 'error: expected POD name';
  const ns = getNs(parsed);

  const nsPods = CLUSTER.pods[ns];
  if (!nsPods || !nsPods[name]) return `Error from server (NotFound): pods "${name}" not found`;
  const pod = nsPods[name];
  const podLogs = CLUSTER.logs[name];
  if (!podLogs) return '';

  let containerName = parsed.container;
  if (!containerName) {
    if (pod.containers.length > 1 && !parsed.container) {
      return `error: a container name must be specified for pod ${name}, choose one of: [${pod.containers.join(' ')}]`;
    }
    containerName = pod.containers[0];
  }

  let logKey = containerName;
  if (parsed.previous) logKey = '__previous__' + containerName;

  const lines = podLogs[logKey];
  if (!lines) {
    if (parsed.previous) return `error: previous terminated container "${containerName}" in pod "${name}" not found`;
    return '';
  }

  if (parsed.tail && parsed.tail > 0) {
    return lines.slice(-parsed.tail).join('\n');
  }
  return lines.join('\n');
}

// ─── kubectl create ──────────────────────────────

function kubectlCreate(parsed) {
  const resource = parsed.positional[0];
  const name = parsed.positional[1];
  if (!resource) return 'error: You must specify the type of resource to create.';

  if (resource === 'namespace' || resource === 'ns') {
    if (!name) return 'error: exactly one NAME is required';
    if (CLUSTER.namespaces[name]) return `Error from server (AlreadyExists): namespaces "${name}" already exists`;
    CLUSTER.namespaces[name] = { status: 'Active', labels: { 'kubernetes.io/metadata.name': name } };
    CLUSTER.pods[name] = {};
    CLUSTER.services[name] = {};
    CLUSTER.deployments[name] = {};
    CLUSTER.configmaps[name] = {};
    CLUSTER.secrets[name] = {};
    return `namespace/${name} created`;
  }
  return `error: unknown resource type "${resource}"`;
}

// ─── kubectl run ─────────────────────────────────

function kubectlRun(parsed) {
  const name = parsed.positional[0];
  if (!name) return 'error: NAME is required';
  const image = parsed.flags.image;
  if (!image) return 'error: --image is required';
  const ns = getNs(parsed);
  if (!CLUSTER.pods[ns]) return `Error from server (NotFound): namespaces "${ns}" not found`;
  if (CLUSTER.pods[ns][name]) return `Error from server (AlreadyExists): pods "${name}" already exists`;

  CLUSTER.pods[ns][name] = {
    status: 'Running', ready: '1/1', restarts: 0, age: '0s', node: 'node-0',
    ip: '10.200.1.' + (30 + Object.keys(CLUSTER.pods[ns]).length), image: image,
    containers: [name], labels: { 'run': name },
  };
  return `pod/${name} created`;
}

// ─── kubectl apply ───────────────────────────────

function kubectlApply(parsed) {
  const filename = parsed.filename;
  if (!filename) return 'error: must specify one of -f and -k';
  const yamlDef = CLUSTER.yamlFiles[filename];
  if (!yamlDef) return `error: the path "${filename}" does not exist`;
  const ns = yamlDef.metadata.namespace || getNs(parsed);

  if (yamlDef.kind === 'Pod') {
    const name = yamlDef.metadata.name;
    if (!CLUSTER.pods[ns]) CLUSTER.pods[ns] = {};
    CLUSTER.pods[ns][name] = {
      status: 'Running', ready: '1/1', restarts: 0, age: '0s', node: 'node-1',
      ip: '10.200.2.' + (30 + Object.keys(CLUSTER.pods[ns]).length),
      image: yamlDef.spec.containers[0].image,
      containers: yamlDef.spec.containers.map(c => c.name),
      labels: yamlDef.metadata.labels || {},
    };
    return `pod/${name} created`;
  }

  if (yamlDef.kind === 'Deployment') {
    const name = yamlDef.metadata.name;
    if (!CLUSTER.deployments[ns]) CLUSTER.deployments[ns] = {};
    const replicas = yamlDef.spec.replicas || 1;
    CLUSTER.deployments[ns][name] = {
      replicas, ready: replicas, upToDate: replicas, available: replicas, age: '0s',
      image: yamlDef.spec.template.spec.containers[0].image, strategy: 'RollingUpdate',
      labels: yamlDef.metadata.labels || {},
      selector: yamlDef.spec.selector.matchLabels || {},
      revisionHistory: [{ revision: 1, image: yamlDef.spec.template.spec.containers[0].image, change: 'Applied from file' }],
    };
    if (!CLUSTER.pods[ns]) CLUSTER.pods[ns] = {};
    for (let i = 0; i < replicas; i++) {
      const hash = Math.random().toString(36).slice(2, 7);
      const podName = `${name}-${hash}`;
      CLUSTER.pods[ns][podName] = {
        status: 'Running', ready: '1/1', restarts: 0, age: '0s', node: i % 2 === 0 ? 'node-0' : 'node-1',
        ip: `10.200.${i % 2 + 1}.${30 + Object.keys(CLUSTER.pods[ns]).length}`,
        image: yamlDef.spec.template.spec.containers[0].image,
        containers: yamlDef.spec.template.spec.containers.map(c => c.name),
        labels: yamlDef.spec.template.metadata.labels || {},
      };
    }
    return `deployment.apps/${name} created`;
  }
  return `error: unsupported kind "${yamlDef.kind}"`;
}

// ─── kubectl delete ──────────────────────────────

function kubectlDelete(parsed) {
  const resource = parsed.positional[0];
  const name = parsed.positional[1];
  if (!resource) return 'error: You must specify the type of resource to delete.';
  if (!name) return 'error: resource name may not be empty';
  const ns = getNs(parsed);

  switch (resource) {
    case 'pod': case 'pods': case 'po': {
      const nsPods = CLUSTER.pods[ns];
      if (!nsPods || !nsPods[name]) return `Error from server (NotFound): pods "${name}" not found`;
      delete nsPods[name];
      return `pod "${name}" deleted`;
    }
    case 'deployment': case 'deployments': case 'deploy': {
      const nsDeps = CLUSTER.deployments[ns] || {};
      if (!nsDeps[name]) return `Error from server (NotFound): deployments.apps "${name}" not found`;
      const dep = nsDeps[name];
      const nsPods = CLUSTER.pods[ns] || {};
      for (const [pname, p] of Object.entries(nsPods)) {
        if (dep.selector && matchLabels(p.labels, Object.entries(dep.selector).map(([k, v]) => `${k}=${v}`).join(','))) {
          delete nsPods[pname];
        }
      }
      delete nsDeps[name];
      return `deployment.apps "${name}" deleted`;
    }
    case 'service': case 'services': case 'svc': {
      const nsSvcs = CLUSTER.services[ns] || {};
      if (!nsSvcs[name]) return `Error from server (NotFound): services "${name}" not found`;
      delete nsSvcs[name];
      return `service "${name}" deleted`;
    }
    case 'namespace': case 'namespaces': case 'ns': {
      if (!CLUSTER.namespaces[name]) return `Error from server (NotFound): namespaces "${name}" not found`;
      if (['default', 'kube-system', 'kube-public'].includes(name)) return `Error from server (Forbidden): namespace "${name}" is protected`;
      delete CLUSTER.namespaces[name];
      delete CLUSTER.pods[name];
      delete CLUSTER.services[name];
      delete CLUSTER.deployments[name];
      delete CLUSTER.configmaps[name];
      delete CLUSTER.secrets[name];
      return `namespace "${name}" deleted`;
    }
    default:
      return `error: the server doesn't have a resource type "${resource}"`;
  }
}

// ─── kubectl scale ───────────────────────────────

function kubectlScale(parsed) {
  const resource = parsed.positional[0];
  const name = parsed.positional[1];
  const replicas = parsed.flags.replicas;
  if (resource !== 'deployment' && resource !== 'deploy') return 'error: only deployments can be scaled';
  if (!name) return 'error: resource name may not be empty';
  if (replicas === undefined || isNaN(replicas)) return 'error: --replicas is required';
  const ns = getNs(parsed);
  const nsDeps = CLUSTER.deployments[ns] || {};
  const d = nsDeps[name];
  if (!d) return `Error from server (NotFound): deployments.apps "${name}" not found`;

  const oldReplicas = d.replicas;
  d.replicas = replicas;
  d.ready = replicas;
  d.upToDate = replicas;
  d.available = replicas;

  const nsPods = CLUSTER.pods[ns] || {};
  const podEntries = Object.entries(nsPods).filter(([, p]) =>
    d.selector && matchLabels(p.labels, Object.entries(d.selector).map(([k, v]) => `${k}=${v}`).join(','))
  );

  if (replicas > oldReplicas) {
    for (let i = 0; i < replicas - oldReplicas; i++) {
      const hash = Math.random().toString(36).slice(2, 12);
      const podName = `${name}-${hash}`;
      nsPods[podName] = {
        status: 'Running', ready: '1/1', restarts: 0, age: '0s', node: i % 2 === 0 ? 'node-0' : 'node-1',
        ip: `10.200.${i % 2 + 1}.${30 + Object.keys(nsPods).length}`,
        image: d.image, containers: ['container'],
        labels: { ...d.selector },
      };
    }
  } else if (replicas < oldReplicas) {
    const toRemove = podEntries.slice(replicas);
    for (const [pname] of toRemove) delete nsPods[pname];
  }
  return `deployment.apps/${name} scaled`;
}

// ─── kubectl rollout ─────────────────────────────

function kubectlRollout(parsed) {
  const subcommand = parsed.positional[0];
  const resource = parsed.positional[1];
  if (!subcommand) return 'error: must specify a subcommand (status, history, undo)';

  let name = resource;
  if (resource && resource.includes('/')) {
    name = resource.split('/')[1];
  } else {
    name = parsed.positional[2] || resource;
  }
  if (!name) return 'error: required resource not specified';
  const ns = getNs(parsed);
  const nsDeps = CLUSTER.deployments[ns] || {};
  const d = nsDeps[name];
  if (!d) return `Error from server (NotFound): deployments.apps "${name}" not found`;

  switch (subcommand) {
    case 'status':
      return `deployment "${name}" successfully rolled out`;
    case 'history': {
      const lines = [`deployment.apps/${name}\nREVISION  CHANGE-CAUSE`];
      for (const rev of d.revisionHistory) {
        lines.push(`${rev.revision}         ${rev.change}`);
      }
      return lines.join('\n');
    }
    case 'undo': {
      if (d.revisionHistory.length < 2) return 'error: no previous revision to roll back to';
      const prev = d.revisionHistory[d.revisionHistory.length - 2];
      d.image = prev.image;
      d.revisionHistory.push({ revision: d.revisionHistory.length + 1, image: prev.image, change: `Rolled back to revision ${prev.revision}` });
      return `deployment.apps/${name} rolled back`;
    }
    default:
      return `error: unknown subcommand "${subcommand}"`;
  }
}

// ─── kubectl expose ──────────────────────────────

function kubectlExpose(parsed) {
  const resource = parsed.positional[0];
  const name = parsed.positional[1];
  if (!resource || !name) return 'error: You must specify a resource to expose.';
  const ns = getNs(parsed);
  const port = parsed.flags.port || '80';
  const type = parsed.flags.type || 'ClusterIP';
  const svcName = name + '-svc';

  if (resource === 'deployment' || resource === 'deploy') {
    const nsDeps = CLUSTER.deployments[ns] || {};
    const d = nsDeps[name];
    if (!d) return `Error from server (NotFound): deployments.apps "${name}" not found`;

    if (!CLUSTER.services[ns]) CLUSTER.services[ns] = {};
    if (CLUSTER.services[ns][svcName]) return `Error from server (AlreadyExists): services "${svcName}" already exists`;

    const clusterIP = '10.32.0.' + (200 + Object.keys(CLUSTER.services[ns]).length);
    const nodePort = type === 'NodePort' ? (31000 + Object.keys(CLUSTER.services[ns]).length) : undefined;
    const portsStr = nodePort ? `${port}:${nodePort}/TCP` : `${port}/TCP`;

    CLUSTER.services[ns][svcName] = {
      type, clusterIP, ports: portsStr, externalIP: '<none>', age: '0s',
      selector: { ...d.selector }, labels: { ...d.labels },
      nodePort,
    };
    return `service/${svcName} exposed`;
  }
  return `error: cannot expose a ${resource}`;
}

// ─── kubectl exec ────────────────────────────────

function kubectlExec(parsed) {
  const name = parsed.positional[0];
  if (!name) return 'error: expected POD name';
  const ns = getNs(parsed);
  const nsPods = CLUSTER.pods[ns];
  if (!nsPods || !nsPods[name]) return `Error from server (NotFound): pods "${name}" not found`;
  const cmdParts = parsed.positional.slice(1);
  if (cmdParts.length === 0) return 'error: you must specify at least one command for the container';

  const cmd = cmdParts.join(' ');
  if (cmd === 'hostname' || cmd === '-- hostname') return name;
  if (cmd === 'cat /etc/os-release' || cmd === '-- cat /etc/os-release') return 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"';
  if (cmd.includes('env') || cmd.includes('printenv')) return 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin\nHOME=/root\nKUBERNETES_SERVICE_HOST=10.32.0.1\nKUBERNETES_SERVICE_PORT=443';
  if (cmd.includes('df')) return 'Filesystem     1K-blocks    Used Available Use% Mounted on\noverlay         20480000 8234567  12245433  40% /';
  if (cmd.includes('ps')) return 'PID   USER     TIME  COMMAND\n    1 root      0:00 /usr/bin/main-process\n   15 root      0:00 ps aux';
  return `(simulated exec: ran "${cmd}" in ${name})`;
}

// ─── kubectl port-forward ────────────────────────

function kubectlPortForward(parsed) {
  const name = parsed.positional[0];
  const portMapping = parsed.positional[1];
  if (!name || !portMapping) return 'error: expected POD and PORT';
  const ns = getNs(parsed);
  const nsPods = CLUSTER.pods[ns];
  if (!nsPods || !nsPods[name]) return `Error from server (NotFound): pods "${name}" not found`;
  return `Forwarding from 127.0.0.1:${portMapping.split(':')[0]} -> ${portMapping.split(':')[1] || portMapping.split(':')[0]}\n(simulated — press Ctrl-C to stop)`;
}

// ─── kubectl config ──────────────────────────────

function kubectlConfig(parsed) {
  const subcommand = parsed.positional[0];
  if (!subcommand) return 'error: must specify a subcommand';

  switch (subcommand) {
    case 'current-context':
      return CLUSTER.currentContext;
    case 'get-contexts': {
      const lines = [pad('CURRENT', 10) + pad('NAME', 14) + pad('CLUSTER', 16) + pad('AUTHINFO', 14) + 'NAMESPACE'];
      for (const [name, ctx] of Object.entries(CLUSTER.contexts)) {
        const current = name === CLUSTER.currentContext ? '*' : '';
        lines.push(pad(current, 10) + pad(name, 14) + pad(ctx.cluster, 16) + pad(ctx.user, 14) + ctx.namespace);
      }
      return lines.join('\n');
    }
    case 'use-context': {
      const ctx = parsed.positional[1];
      if (!ctx) return 'error: must specify a context name';
      if (!CLUSTER.contexts[ctx]) return `error: no context exists with the name: "${ctx}"`;
      CLUSTER.currentContext = ctx;
      CLUSTER.currentNamespace = CLUSTER.contexts[ctx].namespace;
      return `Switched to context "${ctx}".`;
    }
    case 'set-context': {
      const ctx = parsed.positional[1];
      if (!ctx) return 'error: must specify a context name';
      if (ctx === '--current' || ctx === 'current') {
        const ns = parsed.namespace;
        if (ns) {
          CLUSTER.contexts[CLUSTER.currentContext].namespace = ns;
          CLUSTER.currentNamespace = ns;
          return `Context "${CLUSTER.currentContext}" modified.`;
        }
      }
      return `Context "${ctx}" modified.`;
    }
    default:
      return `error: unknown subcommand "${subcommand}"`;
  }
}

// ─── kubectl top ─────────────────────────────────

function kubectlTop(parsed) {
  const resource = parsed.positional[0];
  if (!resource) return 'error: You must specify the type of resource (nodes or pods)';

  if (resource === 'nodes' || resource === 'node') {
    const lines = [pad('NAME', 12) + pad('CPU(cores)', 14) + pad('CPU%', 8) + pad('MEMORY(bytes)', 16) + 'MEMORY%'];
    for (const [name, n] of Object.entries(CLUSTER.nodes)) {
      lines.push(pad(name, 12) + pad(n.metrics.cpuUsage, 14) + pad(n.metrics.cpuPercent + '%', 8) + pad(n.metrics.memUsage, 16) + n.metrics.memPercent + '%');
    }
    return lines.join('\n');
  }

  if (resource === 'pods' || resource === 'pod') {
    const ns = getNs(parsed);
    const nsMetrics = parsed.allNamespaces ? POD_METRICS : { [ns]: POD_METRICS[ns] || {} };
    let header = '';
    if (parsed.allNamespaces) header += pad('NAMESPACE', 14);
    header += pad('NAME', 44) + pad('CPU(cores)', 14) + 'MEMORY(bytes)';
    const lines = [header];
    for (const [namespace, pods] of Object.entries(nsMetrics)) {
      for (const [name, m] of Object.entries(pods || {})) {
        let line = '';
        if (parsed.allNamespaces) line += pad(namespace, 14);
        line += pad(name, 44) + pad(m.cpu, 14) + m.memory;
        lines.push(line);
      }
    }
    return lines.join('\n');
  }
  return `error: unknown resource type "${resource}"`;
}

// ─── kubectl label ───────────────────────────────

function kubectlLabel(parsed) {
  const resource = parsed.positional[0];
  const name = parsed.positional[1];
  const labelArg = parsed.positional[2];
  if (!resource || !name || !labelArg) return 'error: You must specify a resource, name, and label';
  const ns = getNs(parsed);

  if (resource === 'node' || resource === 'nodes') {
    const n = CLUSTER.nodes[name];
    if (!n) return `Error from server (NotFound): nodes "${name}" not found`;
    if (labelArg.endsWith('-')) {
      delete n.labels[labelArg.slice(0, -1)];
    } else {
      const [k, v] = labelArg.split('=');
      n.labels[k] = v || '';
    }
    return `node/${name} labeled`;
  }

  if (resource === 'pod' || resource === 'pods') {
    const nsPods = CLUSTER.pods[ns];
    if (!nsPods || !nsPods[name]) return `Error from server (NotFound): pods "${name}" not found`;
    if (labelArg.endsWith('-')) {
      delete nsPods[name].labels[labelArg.slice(0, -1)];
    } else {
      const [k, v] = labelArg.split('=');
      nsPods[name].labels[k] = v || '';
    }
    return `pod/${name} labeled`;
  }
  return `error: the server doesn't have a resource type "${resource}"`;
}

// ─── kubectl cordon / uncordon / drain ───────────

function kubectlCordon(parsed) {
  const name = parsed.positional[0];
  if (!name) return 'error: must specify a node';
  const n = CLUSTER.nodes[name];
  if (!n) return `Error from server (NotFound): nodes "${name}" not found`;
  n.schedulable = false;
  n.status = 'Ready,SchedulingDisabled';
  return `node/${name} cordoned`;
}

function kubectlUncordon(parsed) {
  const name = parsed.positional[0];
  if (!name) return 'error: must specify a node';
  const n = CLUSTER.nodes[name];
  if (!n) return `Error from server (NotFound): nodes "${name}" not found`;
  n.schedulable = true;
  n.status = 'Ready';
  return `node/${name} uncordoned`;
}

function kubectlDrain(parsed) {
  const name = parsed.positional[0];
  if (!name) return 'error: must specify a node';
  const n = CLUSTER.nodes[name];
  if (!n) return `Error from server (NotFound): nodes "${name}" not found`;

  if (!parsed.flags['ignore-daemonsets']) {
    return `error: cannot delete DaemonSet-managed Pods: use --ignore-daemonsets to ignore`;
  }

  n.schedulable = false;
  n.status = 'Ready,SchedulingDisabled';

  const evicted = [];
  for (const [ns, pods] of Object.entries(CLUSTER.pods)) {
    for (const [pname, p] of Object.entries(pods)) {
      if (p.node === name && p.status === 'Running') {
        const isDaemonSet = p.labels && (p.labels['k8s-app'] === 'kube-proxy');
        if (!isDaemonSet) {
          evicted.push(pname);
          delete pods[pname];
        }
      }
    }
  }
  const lines = [`node/${name} cordoned`];
  for (const e of evicted) lines.push(`evicting pod ${e}`);
  lines.push(`node/${name} drained`);
  return lines.join('\n');
}

// ─── YAML output helpers ─────────────────────────

function nodeToYaml(name, n) {
  return `apiVersion: v1\nkind: Node\nmetadata:\n  name: ${name}\n  labels:\n${Object.entries(n.labels).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}\nstatus:\n  conditions:\n  - type: Ready\n    status: "True"\n  addresses:\n  - type: InternalIP\n    address: ${n.internalIP}\n  nodeInfo:\n    kubeletVersion: ${n.version}\n    containerRuntimeVersion: containerd://2.1.0`;
}

function podToYaml(name, p, ns) {
  return `apiVersion: v1\nkind: Pod\nmetadata:\n  name: ${name}\n  namespace: ${ns}\n  labels:\n${Object.entries(p.labels).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}\nspec:\n  nodeName: ${p.node}\n  containers:\n${p.containers.map(c => `  - name: ${c}\n    image: ${p.image}`).join('\n')}\nstatus:\n  phase: ${p.status}\n  podIP: ${p.ip}`;
}

function configMapToYaml(name, cm, ns) {
  const dataStr = cm.data ? Object.entries(cm.data).map(([k, v]) => `  ${k}: ${v}`).join('\n') : '';
  return `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ${name}\n  namespace: ${ns}\ndata:\n${dataStr}`;
}

// ─── Main Command Dispatcher ─────────────────────

function parseArgs(str) {
  const args = [];
  let current = '';
  let inQuote = null;
  for (const ch of str) {
    if (inQuote) {
      if (ch === inQuote) { inQuote = null; continue; }
      current += ch;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ' ') {
      if (current) { args.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

function executeCommand(input) {
  const args = parseArgs(input.trim());
  if (args.length === 0) return { output: '' };

  const cmd = args[0];

  if (cmd === 'clear') return { output: '', clear: true };
  if (cmd === 'help') return { output: 'Available: kubectl get|describe|logs|create|run|apply|delete|scale|rollout|expose|exec|port-forward|config|top|label|cordon|uncordon|drain, clear, help' };

  if (cmd !== 'kubectl') {
    if (cmd === 'k') {
      args[0] = 'kubectl';
    } else {
      return { output: `${cmd}: command not found. Try: kubectl <subcommand>` };
    }
  }

  const subcommand = args[1];
  if (!subcommand) return { output: 'kubectl controls the Kubernetes cluster manager.\n\nUsage: kubectl [command]\n\nCommands: get, describe, logs, create, run, apply, delete, scale, rollout, expose, exec, port-forward, config, top, label, cordon, uncordon, drain' };

  const parsed = parseKubectlArgs(args.slice(2));

  switch (subcommand) {
    case 'get':          return { output: kubectlGet(parsed) };
    case 'describe':     return { output: kubectlDescribe(parsed) };
    case 'logs': case 'log': return { output: kubectlLogs(parsed) };
    case 'create':       return { output: kubectlCreate(parsed) };
    case 'run':          return { output: kubectlRun(parsed) };
    case 'apply':        return { output: kubectlApply(parsed) };
    case 'delete':       return { output: kubectlDelete(parsed) };
    case 'scale':        return { output: kubectlScale(parsed) };
    case 'rollout':      return { output: kubectlRollout(parsed) };
    case 'expose':       return { output: kubectlExpose(parsed) };
    case 'exec':         return { output: kubectlExec(parsed) };
    case 'port-forward': return { output: kubectlPortForward(parsed) };
    case 'config':       return { output: kubectlConfig(parsed) };
    case 'top':          return { output: kubectlTop(parsed) };
    case 'label':        return { output: kubectlLabel(parsed) };
    case 'cordon':       return { output: kubectlCordon(parsed) };
    case 'uncordon':     return { output: kubectlUncordon(parsed) };
    case 'drain':        return { output: kubectlDrain(parsed) };
    default:
      return { output: `error: unknown command "${subcommand}"` };
  }
}
