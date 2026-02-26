// ══════════════════════════════════════════════════
//  Terminal: The Reload — Game Engine
// ══════════════════════════════════════════════════

// ─── Virtual Filesystem ──────────────────────────

const FS = {
  '/': { type: 'dir', children: ['home', 'var', 'etc', 'tmp'] },
  '/home': { type: 'dir', children: ['kit'] },
  '/home/kit': { type: 'dir', children: ['projects', 'docs', 'notes.txt', '.bashrc', 'todo.md'] },
  '/home/kit/projects': { type: 'dir', children: ['webapp', 'api', 'scripts'] },
  '/home/kit/projects/webapp': { type: 'dir', children: ['src', 'package.json', 'README.md'] },
  '/home/kit/projects/webapp/src': { type: 'dir', children: ['index.js', 'app.js', 'utils.js', 'config.yaml'] },
  '/home/kit/projects/webapp/src/index.js': { type: 'file', content: 'import { app } from "./app";\napp.listen(3000);', size: '42B' },
  '/home/kit/projects/webapp/src/app.js': { type: 'file', content: 'export const app = express();\n// TODO: add routes\n// TODO: add middleware', size: '68B' },
  '/home/kit/projects/webapp/src/utils.js': { type: 'file', content: 'export function slugify(str) {\n  return str.toLowerCase().replace(/\\s+/g, "-");\n}', size: '81B' },
  '/home/kit/projects/webapp/src/config.yaml': { type: 'file', content: 'port: 3000\nhost: localhost\ndebug: true\nlog_level: info', size: '52B' },
  '/home/kit/projects/webapp/package.json': { type: 'file', content: '{\n  "name": "webapp",\n  "version": "1.0.0"\n}', size: '48B' },
  '/home/kit/projects/webapp/README.md': { type: 'file', content: '# Webapp\nA simple web application.', size: '36B' },
  '/home/kit/projects/api': { type: 'dir', children: ['main.go', 'handler.go', 'go.mod'] },
  '/home/kit/projects/api/main.go': { type: 'file', content: 'package main\n\nfunc main() {\n\tlog.Fatal(http.ListenAndServe(":8080", nil))\n}', size: '74B' },
  '/home/kit/projects/api/handler.go': { type: 'file', content: 'package main\n\n// TODO: implement handlers\n// FIXME: error handling is broken', size: '72B' },
  '/home/kit/projects/api/go.mod': { type: 'file', content: 'module github.com/kit/api\ngo 1.22', size: '35B' },
  '/home/kit/projects/scripts': { type: 'dir', children: ['deploy.sh', 'backup.sh', 'cleanup.sh'] },
  '/home/kit/projects/scripts/deploy.sh': { type: 'file', content: '#!/bin/bash\necho "deploying..."\nrsync -avz ./build/ server:/var/www/', size: '65B', mode: '-rw-r--r--' },
  '/home/kit/projects/scripts/backup.sh': { type: 'file', content: '#!/bin/bash\ntar czf backup_$(date +%Y%m%d).tar.gz /home/kit/projects/', size: '70B', mode: '-rwxr-xr-x' },
  '/home/kit/projects/scripts/cleanup.sh': { type: 'file', content: '#!/bin/bash\nfind /tmp -name "*.tmp" -mtime +7 -delete', size: '52B', mode: '-rw-r--r--' },
  '/home/kit/docs': { type: 'dir', children: ['resume.pdf', 'k8s-notes.md', 'meeting-notes.md'] },
  '/home/kit/docs/resume.pdf': { type: 'file', content: '[binary file]', size: '245K' },
  '/home/kit/docs/k8s-notes.md': { type: 'file', content: '# Kubernetes Notes\n\n## Pods\nSmallest deployable unit.\n\n## Services\nStable network endpoint.\n\n## Deployments\nDeclarative updates for Pods.', size: '142B' },
  '/home/kit/docs/meeting-notes.md': { type: 'file', content: 'Team standup 2026-02-20:\n- API migration on track\n- Need to fix deploy script permissions\n- Database backup cron is failing', size: '128B' },
  '/home/kit/notes.txt': { type: 'file', content: 'Remember to fix the deploy script permissions!\nAlso check why backup cron stopped working.\nMeeting with team at 3pm.', size: '112B' },
  '/home/kit/.bashrc': { type: 'file', content: 'export PATH="/usr/local/bin:$PATH"\nalias ll="ls -lahF"\nalias gs="git status"', size: '78B', hidden: true },
  '/home/kit/todo.md': { type: 'file', content: '- [ ] Fix deploy.sh permissions\n- [ ] Set up log rotation\n- [x] Update k8s notes\n- [ ] Review PR #42', size: '95B' },
  '/var': { type: 'dir', children: ['log', 'www'] },
  '/var/log': { type: 'dir', children: ['syslog', 'app.log', 'access.log', 'error.log'] },
  '/var/log/syslog': { type: 'file', content: 'Feb 23 10:00:01 server systemd[1]: Started nginx\nFeb 23 10:00:02 server nginx[1234]: listening on port 80\nFeb 23 10:01:15 server kernel: Out of memory: Kill process 5678\nFeb 23 10:02:30 server sshd[910]: Accepted key for kit', size: '2.1K' },
  '/var/log/app.log': { type: 'file', content: '[INFO] 2026-02-23 10:00:01 Server started on :8080\n[INFO] 2026-02-23 10:00:05 Connected to database\n[WARN] 2026-02-23 10:01:12 Slow query detected (2.3s)\n[ERROR] 2026-02-23 10:02:44 Connection refused: redis:6379\n[INFO] 2026-02-23 10:03:00 Health check OK\n[ERROR] 2026-02-23 10:04:15 Panic: nil pointer dereference\n[INFO] 2026-02-23 10:05:00 Health check OK\n[WARN] 2026-02-23 10:06:30 High memory usage: 89%\n[ERROR] 2026-02-23 10:07:22 Connection refused: redis:6379', size: '4.5K' },
  '/var/log/access.log': { type: 'file', content: '192.168.1.10 - - [23/Feb/2026:10:00:01] "GET / HTTP/1.1" 200 4523\n192.168.1.10 - - [23/Feb/2026:10:00:02] "GET /api/users HTTP/1.1" 200 1024\n10.0.0.5 - - [23/Feb/2026:10:00:03] "POST /api/login HTTP/1.1" 401 128\n10.0.0.5 - - [23/Feb/2026:10:00:04] "POST /api/login HTTP/1.1" 200 256\n192.168.1.10 - - [23/Feb/2026:10:00:05] "GET /static/style.css HTTP/1.1" 304 0\n10.0.0.5 - - [23/Feb/2026:10:00:06] "GET /api/dashboard HTTP/1.1" 200 8192\n192.168.1.20 - - [23/Feb/2026:10:01:00] "GET / HTTP/1.1" 200 4523\n192.168.1.20 - - [23/Feb/2026:10:01:01] "GET /api/users HTTP/1.1" 403 64', size: '3.2K' },
  '/var/log/error.log': { type: 'file', content: '[crit] worker process 1234 exited on signal 11\n[error] upstream timed out (110: Connection timed out)\n[warn] conflicting server name "localhost" on 0.0.0.0:80', size: '1.8K' },
  '/var/www': { type: 'dir', children: ['html'] },
  '/var/www/html': { type: 'dir', children: ['index.html', 'style.css'] },
  '/var/www/html/index.html': { type: 'file', content: '<!DOCTYPE html>\n<html><body><h1>It works!</h1></body></html>', size: '56B' },
  '/var/www/html/style.css': { type: 'file', content: 'body { margin: 0; font-family: sans-serif; }', size: '44B' },
  '/etc': { type: 'dir', children: ['hosts', 'nginx', 'passwd'] },
  '/etc/hosts': { type: 'file', content: '127.0.0.1 localhost\n192.168.88.250 lexbox\n192.168.88.1 gateway', size: '62B' },
  '/etc/nginx': { type: 'dir', children: ['nginx.conf', 'sites-enabled'] },
  '/etc/nginx/nginx.conf': { type: 'file', content: 'worker_processes auto;\nevents { worker_connections 1024; }\nhttp {\n  include /etc/nginx/sites-enabled/*;\n}', size: '98B' },
  '/etc/nginx/sites-enabled': { type: 'dir', children: ['default'] },
  '/etc/nginx/sites-enabled/default': { type: 'file', content: 'server {\n  listen 80;\n  server_name localhost;\n  root /var/www/html;\n}', size: '68B' },
  '/etc/passwd': { type: 'file', content: 'root:x:0:0:root:/root:/bin/bash\nkit:x:1000:1000:Kit Sutliff:/home/kit:/bin/zsh\nnginx:x:101:101:nginx:/var/www:/usr/sbin/nologin\npostgres:x:102:102:PostgreSQL:/var/lib/postgresql:/bin/bash', size: '198B' },
  '/tmp': { type: 'dir', children: ['scratch.tmp', 'build_output.log', 'session_abc123.tmp'] },
  '/tmp/scratch.tmp': { type: 'file', content: 'temporary data', size: '14B' },
  '/tmp/build_output.log': { type: 'file', content: 'Building...\nCompiling main.go\nLinking...\nDone. 0 errors, 2 warnings.', size: '62B' },
  '/tmp/session_abc123.tmp': { type: 'file', content: 'session data', size: '12B' },
};

// ─── Path Utilities ──────────────────────────────

function resolvePath(cwd, input) {
  if (!input) return cwd;
  if (input === '~') return '/home/kit';
  if (input.startsWith('~/')) return '/home/kit' + input.slice(1);
  if (input.startsWith('/')) {
    const cleaned = input.replace(/\/+$/, '') || '/';
    return cleaned;
  }
  let parts = cwd === '/' ? [] : cwd.split('/').filter(Boolean);
  for (const seg of input.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') { parts.pop(); continue; }
    parts.push(seg);
  }
  return '/' + parts.join('/') || '/';
}

function getNode(path) {
  return FS[path] || null;
}

function parentPath(path) {
  if (path === '/') return '/';
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return '/' + parts.join('/') || '/';
}

function basename(path) {
  if (path === '/') return '/';
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

// ─── Command Implementations ─────────────────────

const COMMANDS = {};

COMMANDS.pwd = (args, state) => ({ output: state.cwd });

COMMANDS.cd = (args, state) => {
  const target = args[0] || '~';
  let dest;
  if (target === '-') {
    if (!state.prevCwd) return { output: 'cd: OLDPWD not set' };
    dest = state.prevCwd;
  } else {
    dest = resolvePath(state.cwd, target);
  }
  const node = getNode(dest);
  if (!node) return { output: `cd: no such file or directory: ${target}` };
  if (node.type !== 'dir') return { output: `cd: not a directory: ${target}` };
  state.prevCwd = state.cwd;
  state.cwd = dest;
  return { output: '' };
};

COMMANDS.ls = (args, state) => {
  let showAll = false, showLong = false, showHuman = false;
  const paths = [];
  for (const a of args) {
    if (a.startsWith('-')) {
      if (a.includes('a')) showAll = true;
      if (a.includes('l')) showLong = true;
      if (a.includes('h')) showHuman = true;
    } else {
      paths.push(a);
    }
  }
  const target = paths[0] ? resolvePath(state.cwd, paths[0]) : state.cwd;
  const node = getNode(target);
  if (!node) return { output: `ls: cannot access '${paths[0] || '.'}': No such file or directory` };
  if (node.type === 'file') {
    if (showLong) {
      const mode = node.mode || '-rw-r--r--';
      return { output: `${mode} 1 kit staff ${node.size || '0B'} Feb 23 10:00 ${basename(target)}` };
    }
    return { output: basename(target) };
  }
  let children = node.children || [];
  if (!showAll) children = children.filter(c => !c.startsWith('.'));
  if (showLong) {
    const lines = children.map(c => {
      const childPath = target === '/' ? `/${c}` : `${target}/${c}`;
      const cn = getNode(childPath);
      if (!cn) return c;
      const mode = cn.type === 'dir' ? 'drwxr-xr-x' : (cn.mode || '-rw-r--r--');
      const size = cn.size || (cn.type === 'dir' ? '4.0K' : '0B');
      const suffix = cn.type === 'dir' ? '/' : '';
      return `${mode} 1 kit staff ${size.padStart(6)} Feb 23 10:00 ${c}${suffix}`;
    });
    return { output: lines.join('\n') };
  }
  return { output: children.join('  ') };
};

COMMANDS.cat = (args, state) => {
  let showNumbers = false;
  const files = [];
  for (const a of args) {
    if (a === '-n') showNumbers = true;
    else files.push(a);
  }
  if (files.length === 0) return { output: 'cat: missing file operand' };
  const results = [];
  for (const f of files) {
    const path = resolvePath(state.cwd, f);
    const node = getNode(path);
    if (!node) { results.push(`cat: ${f}: No such file or directory`); continue; }
    if (node.type === 'dir') { results.push(`cat: ${f}: Is a directory`); continue; }
    if (showNumbers) {
      const lines = node.content.split('\n');
      results.push(lines.map((l, i) => `     ${i + 1}\t${l}`).join('\n'));
    } else {
      results.push(node.content);
    }
  }
  return { output: results.join('\n') };
};

COMMANDS.head = (args, state) => {
  let n = 10;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n' && args[i + 1]) { n = parseInt(args[++i]); continue; }
    if (args[i].match(/^-\d+$/)) { n = parseInt(args[i].slice(1)); continue; }
    files.push(args[i]);
  }
  if (files.length === 0) return { output: 'head: missing file operand' };
  const path = resolvePath(state.cwd, files[0]);
  const node = getNode(path);
  if (!node) return { output: `head: ${files[0]}: No such file or directory` };
  if (node.type === 'dir') return { output: `head: ${files[0]}: Is a directory` };
  return { output: node.content.split('\n').slice(0, n).join('\n') };
};

COMMANDS.tail = (args, state) => {
  let n = 10;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n' && args[i + 1]) { n = parseInt(args[++i]); continue; }
    if (args[i] === '-f') continue;
    if (args[i].match(/^-\d+$/)) { n = parseInt(args[i].slice(1)); continue; }
    files.push(args[i]);
  }
  if (files.length === 0) return { output: 'tail: missing file operand' };
  const path = resolvePath(state.cwd, files[0]);
  const node = getNode(path);
  if (!node) return { output: `tail: ${files[0]}: No such file or directory` };
  if (node.type === 'dir') return { output: `tail: ${files[0]}: Is a directory` };
  const lines = node.content.split('\n');
  return { output: lines.slice(-n).join('\n') };
};

COMMANDS.grep = (args, state) => {
  let caseInsensitive = false, recursive = false, lineNumbers = false;
  let context = 0, invert = false, countOnly = false, filesOnly = false;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-') && !a.startsWith('--')) {
      if (a.includes('i')) caseInsensitive = true;
      if (a.includes('r') || a.includes('R')) recursive = true;
      if (a.includes('n')) lineNumbers = true;
      if (a.includes('v')) invert = true;
      if (a.includes('c')) countOnly = true;
      if (a.includes('l')) filesOnly = true;
      if (a.includes('C')) { context = parseInt(args[++i]) || 3; continue; }
    } else if (a === '-C') {
      context = parseInt(args[++i]) || 3;
    } else {
      rest.push(a);
    }
  }
  if (rest.length < 1) return { output: 'grep: missing pattern' };
  const pattern = rest[0];
  const targets = rest.slice(1);
  if (targets.length === 0 && !recursive) return { output: 'grep: missing file operand' };

  const regex = new RegExp(pattern, caseInsensitive ? 'i' : '');
  const results = [];

  function searchFile(filePath, showPath) {
    const node = getNode(filePath);
    if (!node || node.type !== 'file') return;
    const lines = node.content.split('\n');
    const matches = [];
    lines.forEach((line, idx) => {
      const match = regex.test(line);
      if (invert ? !match : match) matches.push({ line, num: idx + 1 });
    });
    if (countOnly) {
      results.push(showPath ? `${filePath}:${matches.length}` : `${matches.length}`);
    } else if (filesOnly) {
      if (matches.length > 0) results.push(filePath);
    } else {
      for (const m of matches) {
        const prefix = showPath ? `${filePath}:` : '';
        const numPrefix = lineNumbers ? `${m.num}:` : '';
        results.push(`${prefix}${numPrefix}${m.line}`);
      }
    }
  }

  function searchDir(dirPath) {
    const node = getNode(dirPath);
    if (!node || node.type !== 'dir') return;
    for (const child of (node.children || [])) {
      const childPath = dirPath === '/' ? `/${child}` : `${dirPath}/${child}`;
      const cn = getNode(childPath);
      if (!cn) continue;
      if (cn.type === 'file') searchFile(childPath, true);
      else if (cn.type === 'dir') searchDir(childPath);
    }
  }

  if (recursive) {
    const searchRoot = targets[0] ? resolvePath(state.cwd, targets[0]) : state.cwd;
    searchDir(searchRoot);
  } else {
    for (const t of targets) {
      const path = resolvePath(state.cwd, t);
      searchFile(path, targets.length > 1);
    }
  }
  return { output: results.join('\n') || '' };
};

COMMANDS.find = (args, state) => {
  let searchPath = '.';
  let namePattern = null;
  let typeFilter = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-name' && args[i + 1]) { namePattern = args[++i]; continue; }
    if (args[i] === '-iname' && args[i + 1]) { namePattern = args[++i]; continue; }
    if (args[i] === '-type' && args[i + 1]) { typeFilter = args[++i]; continue; }
    if (!args[i].startsWith('-')) searchPath = args[i];
  }
  const root = resolvePath(state.cwd, searchPath);
  const results = [];

  function walk(path) {
    const node = getNode(path);
    if (!node) return;
    const name = basename(path);
    let matchesName = true;
    if (namePattern) {
      const re = new RegExp('^' + namePattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      matchesName = re.test(name);
    }
    let matchesType = true;
    if (typeFilter === 'f' && node.type !== 'file') matchesType = false;
    if (typeFilter === 'd' && node.type !== 'dir') matchesType = false;
    if (matchesName && matchesType) results.push(path);
    if (node.type === 'dir') {
      for (const child of (node.children || [])) {
        const childPath = path === '/' ? `/${child}` : `${path}/${child}`;
        walk(childPath);
      }
    }
  }
  walk(root);
  return { output: results.join('\n') };
};

COMMANDS.wc = (args, state) => {
  let linesOnly = false;
  const files = [];
  for (const a of args) {
    if (a === '-l') linesOnly = true;
    else files.push(a);
  }
  if (files.length === 0) return { output: 'wc: missing file operand' };
  const results = [];
  for (const f of files) {
    const path = resolvePath(state.cwd, f);
    const node = getNode(path);
    if (!node || node.type !== 'file') { results.push(`wc: ${f}: No such file or directory`); continue; }
    const lines = node.content.split('\n');
    const words = node.content.split(/\s+/).filter(Boolean);
    if (linesOnly) results.push(`${lines.length} ${f}`);
    else results.push(`${lines.length} ${words.length} ${node.content.length} ${f}`);
  }
  return { output: results.join('\n') };
};

COMMANDS.mkdir = (args, state) => {
  let parents = false;
  const dirs = [];
  for (const a of args) {
    if (a === '-p') parents = true;
    else dirs.push(a);
  }
  if (dirs.length === 0) return { output: 'mkdir: missing operand' };
  for (const d of dirs) {
    const path = resolvePath(state.cwd, d);
    if (getNode(path)) { if (!parents) return { output: `mkdir: cannot create directory '${d}': File exists` }; continue; }
    if (parents) {
      const parts = path.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        const parent = current || '/';
        current = current + '/' + part;
        if (!getNode(current)) {
          FS[current] = { type: 'dir', children: [] };
          const pn = getNode(parent);
          if (pn && pn.children && !pn.children.includes(part)) pn.children.push(part);
        }
      }
    } else {
      const parent = parentPath(path);
      const pn = getNode(parent);
      if (!pn) return { output: `mkdir: cannot create directory '${d}': No such file or directory` };
      const name = basename(path);
      FS[path] = { type: 'dir', children: [] };
      if (!pn.children.includes(name)) pn.children.push(name);
    }
  }
  return { output: '' };
};

COMMANDS.touch = (args, state) => {
  for (const a of args) {
    if (a.startsWith('-')) continue;
    const path = resolvePath(state.cwd, a);
    if (getNode(path)) continue;
    const parent = parentPath(path);
    const pn = getNode(parent);
    if (!pn) return { output: `touch: cannot touch '${a}': No such file or directory` };
    const name = basename(path);
    FS[path] = { type: 'file', content: '', size: '0B' };
    if (!pn.children.includes(name)) pn.children.push(name);
  }
  return { output: '' };
};

COMMANDS.rm = (args, state) => {
  let recursive = false, force = false;
  const files = [];
  for (const a of args) {
    if (a.startsWith('-')) {
      if (a.includes('r') || a.includes('R')) recursive = true;
      if (a.includes('f')) force = true;
    } else {
      files.push(a);
    }
  }
  for (const f of files) {
    const path = resolvePath(state.cwd, f);
    const node = getNode(path);
    if (!node) {
      if (!force) return { output: `rm: cannot remove '${f}': No such file or directory` };
      continue;
    }
    if (node.type === 'dir' && !recursive) return { output: `rm: cannot remove '${f}': Is a directory` };
    function removeRecursive(p) {
      const n = getNode(p);
      if (n && n.type === 'dir') {
        for (const child of (n.children || [])) {
          removeRecursive(p === '/' ? `/${child}` : `${p}/${child}`);
        }
      }
      delete FS[p];
    }
    removeRecursive(path);
    const parent = parentPath(path);
    const pn = getNode(parent);
    if (pn && pn.children) {
      pn.children = pn.children.filter(c => c !== basename(path));
    }
  }
  return { output: '' };
};

COMMANDS.cp = (args, state) => {
  let recursive = false;
  const rest = [];
  for (const a of args) {
    if (a.startsWith('-')) { if (a.includes('r') || a.includes('a') || a.includes('R')) recursive = true; }
    else rest.push(a);
  }
  if (rest.length < 2) return { output: 'cp: missing file operand' };
  const srcPath = resolvePath(state.cwd, rest[0]);
  const destPath = resolvePath(state.cwd, rest[1]);
  const srcNode = getNode(srcPath);
  if (!srcNode) return { output: `cp: cannot stat '${rest[0]}': No such file or directory` };
  if (srcNode.type === 'dir' && !recursive) return { output: `cp: -r not specified; omitting directory '${rest[0]}'` };

  function copyNode(sp, dp) {
    const sn = getNode(sp);
    if (!sn) return;
    if (sn.type === 'file') {
      FS[dp] = { ...sn };
    } else {
      FS[dp] = { type: 'dir', children: [...sn.children] };
      for (const child of sn.children) {
        copyNode(sp === '/' ? `/${child}` : `${sp}/${child}`, `${dp}/${child}`);
      }
    }
  }

  const destNode = getNode(destPath);
  let finalDest = destPath;
  if (destNode && destNode.type === 'dir') {
    finalDest = `${destPath}/${basename(srcPath)}`;
  }
  copyNode(srcPath, finalDest);
  const dp = parentPath(finalDest);
  const dpn = getNode(dp);
  if (dpn && dpn.children && !dpn.children.includes(basename(finalDest))) {
    dpn.children.push(basename(finalDest));
  }
  return { output: '' };
};

COMMANDS.mv = (args, state) => {
  const rest = args.filter(a => !a.startsWith('-'));
  if (rest.length < 2) return { output: 'mv: missing file operand' };
  const result = COMMANDS.cp(['-r', ...rest], state);
  if (result.output) return result;
  return COMMANDS.rm(['-rf', rest[0]], state);
};

COMMANDS.chmod = (args, state) => {
  let recursive = false;
  const rest = [];
  for (const a of args) {
    if (a === '-R') recursive = true;
    else rest.push(a);
  }
  if (rest.length < 2) return { output: 'chmod: missing operand' };
  const mode = rest[0];
  const path = resolvePath(state.cwd, rest[1]);
  const node = getNode(path);
  if (!node) return { output: `chmod: cannot access '${rest[1]}': No such file or directory` };
  if (mode === '+x') {
    node.mode = '-rwxr-xr-x';
  } else if (/^\d{3}$/.test(mode)) {
    const bits = { '7': 'rwx', '6': 'rw-', '5': 'r-x', '4': 'r--', '3': '-wx', '2': '-w-', '1': '--x', '0': '---' };
    const prefix = node.type === 'dir' ? 'd' : '-';
    node.mode = prefix + (bits[mode[0]] || '---') + (bits[mode[1]] || '---') + (bits[mode[2]] || '---');
  }
  return { output: '' };
};

COMMANDS.echo = (args, state) => {
  return { output: args.join(' ').replace(/^["']|["']$/g, '') };
};

COMMANDS.clear = () => ({ output: '', clear: true });

COMMANDS.help = () => ({
  output: 'Available: pwd, cd, ls, cat, head, tail, grep, find, wc, mkdir, touch, rm, cp, mv, chmod, echo, clear, help'
});

COMMANDS.whoami = () => ({ output: 'kit' });

COMMANDS.man = (args) => {
  if (args.length === 0) return { output: 'What manual page do you want?' };
  return { output: `Sorry — no man pages in the sim. But you know what ${args[0]} does. That's why you're here.` };
};

COMMANDS.diff = (args, state) => {
  const files = args.filter(a => !a.startsWith('-'));
  if (files.length < 2) return { output: 'diff: missing file operand' };
  const p1 = resolvePath(state.cwd, files[0]);
  const p2 = resolvePath(state.cwd, files[1]);
  const n1 = getNode(p1);
  const n2 = getNode(p2);
  if (!n1) return { output: `diff: ${files[0]}: No such file or directory` };
  if (!n2) return { output: `diff: ${files[1]}: No such file or directory` };
  if (n1.content === n2.content) return { output: '' };
  return { output: `Files ${files[0]} and ${files[1]} differ` };
};

// Pipe support: handle simple | chains
function parsePipeline(input) {
  const segments = [];
  let current = '';
  let inQuote = null;
  for (const ch of input) {
    if (inQuote) {
      current += ch;
      if (ch === inQuote) inQuote = null;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
      current += ch;
    } else if (ch === '|') {
      segments.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) segments.push(current.trim());
  return segments.filter(Boolean);
}

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

function executeCommand(input, state) {
  const pipeline = parsePipeline(input);
  let lastOutput = '';
  let shouldClear = false;

  for (let i = 0; i < pipeline.length; i++) {
    const parts = parseArgs(pipeline[i]);
    if (parts.length === 0) continue;
    const cmd = parts[0];
    const args = parts.slice(1);

    if (i > 0 && lastOutput) {
      args.push('__piped__');
    }

    const handler = COMMANDS[cmd];
    if (!handler) {
      return { output: `${cmd}: command not found`, clear: false };
    }

    const result = handler(args, state, lastOutput);
    lastOutput = result.output || '';
    if (result.clear) shouldClear = true;
  }

  return { output: lastOutput, clear: shouldClear };
}

// ─── Level System ────────────────────────────────

const LEVELS = [
  {
    id: 'move',
    name: 'Move',
    subtitle: 'Navigator Lex',
    chibi: 'chibi-move.png',
    intro: "You remember how to walk. Let's see if you remember how to run.",
    challenges: [
      {
        prompt: "Where are you right now? Print your working directory.",
        hint: "Three letters. Starts with p.",
        answer: "pwd",
        check: (input) => input.trim() === 'pwd',
        successMsg: "There you are."
      },
      {
        prompt: "Go to the projects directory.",
        hint: "It's at ~/projects",
        answer: "cd ~/projects",
        check: (input, state) => {
          return input.includes('cd') && (state.cwd === '/home/kit/projects');
        },
        successMsg: "Smooth."
      },
      {
        prompt: "List everything in here — including hidden files, with details.",
        hint: "ls with some flags. -l for long, -a for all.",
        answer: "ls -la",
        check: (input) => {
          const normalized = input.replace(/\s+/g, ' ').trim();
          return normalized.startsWith('ls') && normalized.includes('-') && /[la]/.test(normalized) && /[al]/.test(normalized);
        },
        successMsg: "Now you can actually see what's here."
      },
      {
        prompt: "Go into the webapp directory, then come straight back here. Two commands.",
        hint: "cd somewhere, then cd back. There's a one-character shortcut for 'back where I was.'",
        answer: "cd webapp && cd -",
        check: (input, state) => {
          return state.cwd === '/home/kit/projects' && input.includes('cd -');
        },
        successMsg: "cd - is a reflex, not a command. You'll use it fifty times a day."
      },
    ],
    boss: {
      name: "The Labyrinth",
      intro: "You're in /. Navigate to the webapp src directory and list its contents sorted by size — in one line.",
      hint: "You can chain: cd /path && ls -flags",
      answer: "cd /home/kit/projects/webapp/src && ls -lahS",
      check: (input, state) => {
        return input.includes('cd') && input.includes('&&') && input.includes('ls') && /[sS]/.test(input);
      },
      successMsg: "The maze is nothing when you know the turns."
    }
  },
  {
    id: 'touch',
    name: 'Touch',
    subtitle: 'Architect Lex',
    chibi: 'chibi-touch.png',
    intro: "Time to build things. And break things. Know the difference.",
    challenges: [
      {
        prompt: "Create a new empty file called test.txt",
        hint: "The command is the name of this level.",
        answer: "touch test.txt",
        check: (input) => input.trim().startsWith('touch') && input.includes('test.txt'),
        successMsg: "It exists now. From nothing."
      },
      {
        prompt: "Create a nested directory structure: build/dist/assets — all at once.",
        hint: "mkdir with the flag that creates parents.",
        answer: "mkdir -p build/dist/assets",
        check: (input) => input.includes('mkdir') && input.includes('-p') && input.includes('build'),
        successMsg: "One command, three directories. -p is doing the heavy lifting."
      },
      {
        prompt: "Copy the entire webapp directory to a backup called webapp-backup.",
        hint: "cp needs a flag to handle directories.",
        answer: "cp -r webapp webapp-backup",
        check: (input) => input.includes('cp') && (input.includes('-r') || input.includes('-a')) && input.includes('webapp'),
        successMsg: "Backed up. Because smart engineers copy before they destroy."
      },
      {
        prompt: "Delete the build directory you just created. Recursively. Forcefully.",
        hint: "rm with -rf. Read the path twice.",
        answer: "rm -rf build",
        check: (input) => input.includes('rm') && input.includes('-r') && input.includes('build'),
        successMsg: "Gone. No undo. You typed it right — that's what matters."
      },
    ],
    boss: {
      name: "The Scaffolder",
      intro: "Create a project skeleton with src, tests, and docs subdirectories — in one command using brace expansion.",
      hint: "mkdir -p with {curly,braces}",
      answer: "mkdir -p project/{src,tests,docs}",
      check: (input) => {
        return input.includes('mkdir') && input.includes('{') && input.includes('}') && input.includes('-p');
      },
      successMsg: "Brace expansion. One command. Three directories. This is what fluency looks like."
    }
  },
  {
    id: 'read',
    name: 'Read',
    subtitle: 'Detective Lex',
    chibi: 'chibi-read.png',
    intro: "Finding things in files. This is where the terminal leaves GUIs in the dust.",
    challenges: [
      {
        prompt: "Show the contents of /var/log/app.log",
        hint: "The simplest file viewer.",
        answer: "cat /var/log/app.log",
        check: (input) => input.includes('cat') && input.includes('app.log'),
        successMsg: "Data. Now let's learn to filter it."
      },
      {
        prompt: "Show only the last 3 lines of /var/log/app.log",
        hint: "tail with a number.",
        answer: "tail -3 /var/log/app.log",
        check: (input) => input.includes('tail') && input.includes('3') && input.includes('app.log'),
        successMsg: "The end is usually where the interesting stuff lives."
      },
      {
        prompt: "Find all lines containing 'ERROR' in /var/log/app.log",
        hint: "grep — the verb is 'find text in files.'",
        answer: "grep ERROR /var/log/app.log",
        check: (input) => input.includes('grep') && /error/i.test(input) && input.includes('app.log'),
        successMsg: "Three errors. Now you know what to fix."
      },
      {
        prompt: "Find all .yaml files anywhere under /home/kit",
        hint: "find with -name and a wildcard.",
        answer: 'find /home/kit -name "*.yaml"',
        check: (input) => input.includes('find') && input.includes('-name') && input.includes('*.yaml'),
        successMsg: "Found it. find walks the tree so you don't have to."
      },
      {
        prompt: "Count how many lines are in /var/log/access.log",
        hint: "wc — word count — with -l for lines.",
        answer: "wc -l /var/log/access.log",
        check: (input) => input.includes('wc') && input.includes('-l') && input.includes('access.log'),
        successMsg: "8 lines. Quick, clean, no guessing."
      },
    ],
    boss: {
      name: "The Incident",
      intro: "Something is wrong. Find all ERROR lines in /var/log/app.log — with line numbers — and count them.",
      hint: "Pipe grep into wc. Use the -n flag on grep for line numbers.",
      answer: "grep -n ERROR /var/log/app.log | wc -l",
      check: (input) => {
        return input.includes('grep') && /error/i.test(input) && input.includes('|') && input.includes('wc') && input.includes('-l');
      },
      successMsg: "3 errors. You diagnosed the incident in one line. That's the kind of thing that gets noticed in a war room."
    }
  },
  {
    id: 'pipe',
    name: 'Pipe',
    subtitle: 'Plumber Lex',
    chibi: 'chibi-pipe.png',
    intro: "Composability. The reason Unix won. Plug commands together like LEGO.",
    challenges: [
      {
        prompt: "List files in /var/log and pipe it through grep to find ones containing 'app'.",
        hint: "ls piped to grep.",
        answer: "ls /var/log | grep app",
        check: (input) => input.includes('ls') && input.includes('|') && input.includes('grep') && input.includes('app'),
        successMsg: "Your first pipe. stdout of the left, stdin of the right."
      },
      {
        prompt: "Show the contents of /etc/passwd and count the lines.",
        hint: "cat piped to wc -l.",
        answer: "cat /etc/passwd | wc -l",
        check: (input) => input.includes('cat') && input.includes('|') && input.includes('wc') && input.includes('-l') && input.includes('passwd'),
        successMsg: "4 users. cat | wc -l is instant census."
      },
      {
        prompt: "Search for all TODO comments recursively in /home/kit/projects, then count how many there are.",
        hint: "grep -r piped to wc -l.",
        answer: "grep -r TODO /home/kit/projects | wc -l",
        check: (input) => input.includes('grep') && (input.includes('-r') || input.includes('-R')) && input.includes('|') && input.includes('wc'),
        successMsg: "Every TODO in the codebase, counted in one shot."
      },
    ],
    boss: {
      name: "The Pipeline",
      intro: "Extract just the IP addresses from /var/log/access.log (they're the first field on each line), sort them, deduplicate, and count occurrences of each. One pipeline.",
      hint: "awk '{print $1}' to get column 1, then sort | uniq -c | sort -rn",
      answer: "awk '{print $1}' /var/log/access.log | sort | uniq -c | sort -rn",
      check: (input) => {
        return input.includes('|') && input.includes('sort') && input.includes('uniq');
      },
      successMsg: "Sort | uniq -c | sort -rn. The frequency analysis pipeline. You'll use this more than you think."
    }
  },
  {
    id: 'lock',
    name: 'Lock',
    subtitle: 'Guardian Lex',
    chibi: 'chibi-lock.png',
    intro: "Permissions. Three groups of three. Owner, group, other. Read, write, execute.",
    challenges: [
      {
        prompt: "Check the permissions on /home/kit/projects/scripts/deploy.sh (list it with details).",
        hint: "ls -l on the file.",
        answer: "ls -l /home/kit/projects/scripts/deploy.sh",
        check: (input) => input.includes('ls') && input.includes('-l') && input.includes('deploy.sh'),
        successMsg: "-rw-r--r-- — no execute bit. That's the problem your team mentioned."
      },
      {
        prompt: "Make deploy.sh executable.",
        hint: "chmod with +x",
        answer: "chmod +x /home/kit/projects/scripts/deploy.sh",
        check: (input) => input.includes('chmod') && input.includes('+x') && input.includes('deploy.sh'),
        successMsg: "Now it can run. That's literally what was blocking the deploy."
      },
      {
        prompt: "Set /home/kit/projects/scripts/cleanup.sh to 755 (rwxr-xr-x).",
        hint: "chmod with numeric mode.",
        answer: "chmod 755 /home/kit/projects/scripts/cleanup.sh",
        check: (input) => input.includes('chmod') && input.includes('755') && input.includes('cleanup.sh'),
        successMsg: "Owner: full access. Group and others: read and execute. The standard for scripts."
      },
    ],
    boss: {
      name: "The Lockdown",
      intro: "The meeting notes mention fixing deploy script permissions. Make ALL scripts in /home/kit/projects/scripts/ executable. One command.",
      hint: "chmod +x with a glob pattern, or use -R",
      answer: "chmod +x /home/kit/projects/scripts/*",
      check: (input) => {
        return input.includes('chmod') && input.includes('+x') && (input.includes('scripts/*') || input.includes('scripts/'));
      },
      successMsg: "Every script in the directory — executable. Your team's deploy is unblocked. That's a PR-worthy fix in 4 seconds."
    }
  },
  {
    id: 'cut',
    name: 'Cut',
    subtitle: 'Surgeon Lex',
    chibi: 'chibi-cut.png',
    intro: "Text processing. The terminal is a text transformation machine that also happens to run programs.",
    challenges: [
      {
        prompt: "Extract just the usernames (first field, colon-delimited) from /etc/passwd.",
        hint: "cut with -d for delimiter and -f for field.",
        answer: "cut -d: -f1 /etc/passwd",
        check: (input) => input.includes('cut') && input.includes('-d') && input.includes(':') && input.includes('-f1') && input.includes('passwd'),
        successMsg: "root, kit, nginx, postgres. Clean column extraction."
      },
      {
        prompt: "Get just the first column (IP addresses) from /var/log/access.log using awk.",
        hint: "awk '{print $1}' — $1 is the first whitespace-delimited field.",
        answer: "awk '{print $1}' /var/log/access.log",
        check: (input) => input.includes('awk') && input.includes('$1') && input.includes('access.log'),
        successMsg: "awk reads columns like a spreadsheet. $1, $2, $3... $NF for the last one."
      },
      {
        prompt: "Show the contents of /var/log/app.log but only lines that do NOT contain 'INFO'.",
        hint: "grep with the invert flag.",
        answer: "grep -v INFO /var/log/app.log",
        check: (input) => input.includes('grep') && input.includes('-v') && input.includes('INFO') && input.includes('app.log'),
        successMsg: "Inverted match. Cut the noise, keep the signal."
      },
    ],
    boss: {
      name: "The Analyst",
      intro: "Analyze access.log: extract the HTTP status codes (9th field), sort them, count unique occurrences, and rank by frequency. Full pipeline.",
      hint: "awk for column 9, then sort | uniq -c | sort -rn",
      answer: "awk '{print $9}' /var/log/access.log | sort | uniq -c | sort -rn",
      check: (input) => {
        return input.includes('awk') && input.includes('sort') && input.includes('uniq') && input.includes('-c');
      },
      successMsg: "Status code distribution in one line. 200s, 304s, 401s, 403s — now you know your traffic patterns."
    }
  },
  {
    id: 'watch',
    name: 'Watch',
    subtitle: 'Sentinel Lex',
    chibi: 'chibi-watch.png',
    intro: "What's running, what's eating resources, and how to stop it.",
    challenges: [
      {
        prompt: "Show all the files in /var/log with full details.",
        hint: "ls with -l for long listing on /var/log.",
        answer: "ls -lh /var/log",
        check: (input) => {
          const hasLs = input.includes('ls');
          const hasLog = input.includes('/var/log');
          const flags = input.match(/-\w+/g) || [];
          const allFlags = flags.join('');
          const hasL = allFlags.includes('l');
          return hasLs && hasLog && hasL;
        },
        successMsg: "File sizes you can actually read. Not everything needs to be in bytes."
      },
      {
        prompt: "Display who you're logged in as.",
        hint: "Five letters. Who am I?",
        answer: "whoami",
        check: (input) => input.trim() === 'whoami',
        successMsg: "kit. Obviously."
      },
      {
        prompt: "Find all files in /var/log and count them.",
        hint: "find with -type f piped to wc -l.",
        answer: "find /var/log -type f | wc -l",
        check: (input) => input.includes('find') && input.includes('/var/log') && input.includes('-type') && input.includes('f') && input.includes('wc') && input.includes('-l'),
        successMsg: "Quick inventory. Know what you're working with before you start cleaning."
      },
    ],
    boss: {
      name: "The Watcher",
      intro: "The logs are noisy. Find all ERROR and WARN lines across all files in /var/log — recursively, case-insensitive, with line numbers. One command.",
      hint: "grep with -rni and an extended pattern (use -E for 'or').",
      answer: 'grep -rni -E "ERROR|WARN" /var/log',
      check: (input) => {
        return input.includes('grep') && (input.includes('-r') || input.includes('-R')) &&
          /error|warn/i.test(input) && input.includes('/var/log');
      },
      successMsg: "Every warning and error across every log file. That's situational awareness. That's how you walk into a standup knowing what happened overnight."
    }
  },
  {
    id: 'tricks',
    name: 'Tricks',
    subtitle: 'Archmage Lex',
    chibi: 'chibi-tricks.png',
    intro: "The difference between 'knows the terminal' and 'lives in the terminal.'",
    challenges: [
      {
        prompt: "Create three directories at once using brace expansion: alpha, beta, gamma.",
        hint: "mkdir with {curly,braces,like,this}",
        answer: "mkdir {alpha,beta,gamma}",
        check: (input) => input.includes('mkdir') && input.includes('{') && input.includes('alpha') && input.includes('beta') && input.includes('gamma'),
        successMsg: "Brace expansion. The shell wrote three commands so you didn't have to."
      },
      {
        prompt: "Find all files in /home/kit with 'TODO' in them — show just the filenames, not the matching lines.",
        hint: "grep with -rl for recursive + files-only.",
        answer: "grep -rl TODO /home/kit",
        check: (input) => input.includes('grep') && (input.includes('-rl') || input.includes('-lr')) && input.includes('TODO'),
        successMsg: "Five files with TODOs. Now you know where the debt lives."
      },
      {
        prompt: "Rename /home/kit/notes.txt to /home/kit/notes.md in one command.",
        hint: "mv is rename.",
        answer: "mv /home/kit/notes.txt /home/kit/notes.md",
        check: (input) => input.includes('mv') && input.includes('notes.txt') && input.includes('notes.md'),
        successMsg: "Rename is just mv. Same command. No special syntax."
      },
    ],
    boss: {
      name: "The Final Boss",
      intro: "You've come through the whole gauntlet. One last challenge: find every file in /home/kit/projects that contains either 'TODO' or 'FIXME' — case insensitive, recursive, show filenames only.",
      hint: "grep -rli with -E for extended regex 'TODO|FIXME'.",
      answer: 'grep -rli -E "TODO|FIXME" /home/kit/projects',
      check: (input) => {
        const flags = (input.match(/-\w+/g) || []).join('');
        return input.includes('grep') && flags.includes('r') &&
          flags.includes('l') &&
          (/TODO/i.test(input)) && (/FIXME/i.test(input));
      },
      successMsg: null
    }
  },
];

// ─── Game State ──────────────────────────────────

const GAME = {
  currentLevel: 0,
  currentChallenge: 0,
  inBoss: false,
  completed: JSON.parse(localStorage.getItem('terminal-reload-completed') || '[]'),
  shellState: { cwd: '/home/kit', prevCwd: null },
  history: [],
  historyIndex: -1,
  hintCount: 0,
};

function saveProgress() {
  localStorage.setItem('terminal-reload-completed', JSON.stringify(GAME.completed));
}

// ─── UI Rendering ────────────────────────────────

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function renderLevelSelect() {
  const container = $('#level-select-grid');
  container.innerHTML = '';
  LEVELS.forEach((level, i) => {
    const card = document.createElement('button');
    card.className = 'level-card';
    const isCompleted = GAME.completed.includes(level.id);
    const isUnlocked = i === 0 || GAME.completed.includes(LEVELS[i - 1].id);
    if (isCompleted) card.classList.add('completed');
    if (!isUnlocked) card.classList.add('locked');
    card.innerHTML = `
      <div class="level-number">${isCompleted ? '&#10003;' : (isUnlocked ? i + 1 : '&#128274;')}</div>
      <div class="level-name">${level.name}</div>
      <div class="level-subtitle">${level.subtitle}</div>
    `;
    if (isUnlocked) {
      card.addEventListener('click', () => startLevel(i));
    }
    container.appendChild(card);
  });
}

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(`#${id}`).classList.add('active');
}

function startLevel(index) {
  GAME.currentLevel = index;
  GAME.currentChallenge = 0;
  GAME.inBoss = false;
  GAME.shellState = { cwd: '/home/kit', prevCwd: null };
  GAME.history = [];
  GAME.historyIndex = -1;

  resetFS();

  const level = LEVELS[index];
  $('#game-level-name').textContent = `Level ${index + 1}: ${level.name}`;
  $('#game-level-subtitle').textContent = level.subtitle;
  $('#game-chibi').src = level.chibi;
  $('#game-chibi').alt = level.subtitle;

  clearTerminal();
  printToTerminal(`\n  ═══ Level ${index + 1}: ${level.name} ═══`, 'header');
  printToTerminal(`  ${level.subtitle}\n`, 'subtitle');
  printToTerminal(`  ${level.intro}\n`, 'intro');
  showChallenge();
  showScreen('game-screen');
  focusInput();
}

function showChallenge() {
  GAME.hintCount = 0;
  const level = LEVELS[GAME.currentLevel];
  if (GAME.inBoss) {
    const boss = level.boss;
    $('#challenge-counter').textContent = 'BOSS';
    $('#challenge-counter').classList.add('boss-counter');
    printToTerminal(`\n  ◆ BOSS: ${boss.name} ◆`, 'boss-name');
    printToTerminal(`  ${boss.intro}\n`, 'challenge');
    updateChibiExpression('boss');
  } else {
    const challenge = level.challenges[GAME.currentChallenge];
    const total = level.challenges.length;
    $('#challenge-counter').textContent = `${GAME.currentChallenge + 1}/${total}`;
    $('#challenge-counter').classList.remove('boss-counter');
    printToTerminal(`  ▸ Challenge ${GAME.currentChallenge + 1}/${total}`, 'challenge-num');
    printToTerminal(`  ${challenge.prompt}\n`, 'challenge');
    updateChibiExpression('thinking');
  }
}

function handleInput(input) {
  if (!input.trim()) return;

  GAME.history.push(input);
  GAME.historyIndex = GAME.history.length;

  printToTerminal(`kit@reload:${shortPath(GAME.shellState.cwd)}$ ${input}`, 'input-echo');

  if (input.trim() === 'hint') {
    GAME.hintCount++;
    const level = LEVELS[GAME.currentLevel];
    const challenge = GAME.inBoss ? level.boss : level.challenges[GAME.currentChallenge];
    if (GAME.hintCount >= 2 && challenge.answer) {
      printToTerminal(`  💡 ${challenge.hint}`, 'hint');
      printToTerminal(`  ⟶  ${challenge.answer}\n`, 'answer');
    } else {
      printToTerminal(`  💡 ${challenge.hint}\n`, 'hint');
    }
    return;
  }

  const result = executeCommand(input, GAME.shellState);
  if (result.clear) {
    clearTerminal();
  } else if (result.output) {
    printToTerminal(result.output, 'output');
  }
  updatePrompt();

  const level = LEVELS[GAME.currentLevel];
  if (GAME.inBoss) {
    if (level.boss.check(input, GAME.shellState)) {
      if (level.boss.successMsg) {
        printToTerminal(`\n  ✦ ${level.boss.successMsg}`, 'success');
      }
      completeBoss();
    }
  } else {
    const challenge = level.challenges[GAME.currentChallenge];
    if (challenge.check(input, GAME.shellState)) {
      printToTerminal(`\n  ✓ ${challenge.successMsg}`, 'success');
      updateChibiExpression('happy');
      GAME.currentChallenge++;
      if (GAME.currentChallenge >= level.challenges.length) {
        GAME.inBoss = true;
        setTimeout(() => showChallenge(), 800);
      } else {
        setTimeout(() => showChallenge(), 800);
      }
    }
  }
}

function completeBoss() {
  const level = LEVELS[GAME.currentLevel];
  if (!GAME.completed.includes(level.id)) {
    GAME.completed.push(level.id);
    saveProgress();
  }
  updateChibiExpression('victory');

  const isLastLevel = GAME.currentLevel === LEVELS.length - 1;

  if (isLastLevel) {
    printToTerminal('\n  ════════════════════════════════════════', 'victory');
    printToTerminal('  ✦ Congratul8ions! ✦', 'victory-title');
    printToTerminal('  ════════════════════════════════════════\n', 'victory');
    printToTerminal('  You remembered everything. Your fingers never forgot.', 'victory');
    printToTerminal('  Now go make your team wonder if you ever stopped.\n', 'victory');
  } else {
    printToTerminal(`\n  ══ Level ${GAME.currentLevel + 1} Complete ══`, 'victory');
    printToTerminal(`  Boss defeated: ${level.boss.name}\n`, 'victory');
  }

  setTimeout(() => {
    showScreen('level-select');
    renderLevelSelect();
  }, isLastLevel ? 4000 : 2500);
}

function shortPath(cwd) {
  if (cwd === '/home/kit') return '~';
  if (cwd.startsWith('/home/kit/')) return '~/' + cwd.slice('/home/kit/'.length);
  return cwd;
}

// ─── Terminal UI ─────────────────────────────────

function clearTerminal() {
  $('#terminal-output-inner').innerHTML = '';
}

function printToTerminal(text, className) {
  const inner = $('#terminal-output-inner');
  const outer = $('#terminal-output');
  const line = document.createElement('div');
  line.className = `term-line ${className || ''}`;
  line.textContent = text;
  inner.appendChild(line);
  outer.scrollTop = outer.scrollHeight;
}

function focusInput() {
  setTimeout(() => $('#terminal-input').focus(), 50);
}

function updateChibiExpression(mood) {
  const chibi = $('#game-chibi');
  chibi.className = 'game-chibi';
  chibi.classList.add(`chibi-${mood}`);
}

function updatePrompt() {
  const prompt = $('#terminal-prompt');
  prompt.innerHTML = `kit@reload:${shortPath(GAME.shellState.cwd)}$&nbsp;`;
}

// ─── FS Reset ────────────────────────────────────

let FS_BACKUP = null;

function backupFS() {
  FS_BACKUP = JSON.parse(JSON.stringify(FS));
}

function resetFS() {
  if (FS_BACKUP) {
    for (const key of Object.keys(FS)) delete FS[key];
    Object.assign(FS, JSON.parse(JSON.stringify(FS_BACKUP)));
  }
}

// ─── Tab Completion ──────────────────────────────

function tabComplete(input, state) {
  const parts = input.split(/\s+/);
  const isFirstWord = parts.length <= 1;
  const partial = parts[parts.length - 1] || '';

  if (isFirstWord) {
    const cmds = Object.keys(COMMANDS).filter(c => c.startsWith(partial));
    if (cmds.length === 0) return { completed: input, completions: [] };
    if (cmds.length === 1) return { completed: cmds[0] + ' ', completions: cmds };
    const common = commonPrefix(cmds);
    return { completed: common, completions: cmds };
  }

  let pathPart = partial;
  let dirPath, prefix, nameStart;

  if (pathPart.includes('/')) {
    const lastSlash = pathPart.lastIndexOf('/');
    prefix = pathPart.slice(0, lastSlash + 1);
    nameStart = pathPart.slice(lastSlash + 1);
    dirPath = resolvePath(state.cwd, prefix);
  } else {
    prefix = '';
    nameStart = pathPart;
    dirPath = state.cwd;
  }

  const dirNode = getNode(dirPath);
  if (!dirNode || dirNode.type !== 'dir') return { completed: input, completions: [] };

  const matches = (dirNode.children || []).filter(c => c.startsWith(nameStart));
  if (matches.length === 0) return { completed: input, completions: [] };

  const beforeLastPart = parts.slice(0, -1).join(' ') + ' ';

  if (matches.length === 1) {
    const match = matches[0];
    const matchPath = dirPath === '/' ? `/${match}` : `${dirPath}/${match}`;
    const matchNode = getNode(matchPath);
    const suffix = matchNode && matchNode.type === 'dir' ? '/' : ' ';
    return { completed: beforeLastPart + prefix + match + suffix, completions: matches };
  }

  const common = commonPrefix(matches);
  return { completed: beforeLastPart + prefix + common, completions: matches };
}

function commonPrefix(strings) {
  if (strings.length === 0) return '';
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

// ─── Init ────────────────────────────────────────

function init() {
  backupFS();
  renderLevelSelect();

  $('#terminal-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const input = e.target.value;
      e.target.value = '';
      handleInput(input);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const result = tabComplete(e.target.value, GAME.shellState);
      if (result.completions.length === 1) {
        e.target.value = result.completed;
      } else if (result.completions.length > 1) {
        e.target.value = result.completed;
        printToTerminal(result.completions.join('  '), 'tab-complete');
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (GAME.historyIndex > 0) {
        GAME.historyIndex--;
        e.target.value = GAME.history[GAME.historyIndex] || '';
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (GAME.historyIndex < GAME.history.length - 1) {
        GAME.historyIndex++;
        e.target.value = GAME.history[GAME.historyIndex] || '';
      } else {
        GAME.historyIndex = GAME.history.length;
        e.target.value = '';
      }
    }
  });

  $('#btn-back-to-levels').addEventListener('click', () => {
    showScreen('level-select');
    renderLevelSelect();
  });

  $('#btn-reset-progress').addEventListener('click', () => {
    if (confirm('Reset all progress?')) {
      GAME.completed = [];
      saveProgress();
      renderLevelSelect();
    }
  });

  document.addEventListener('click', (e) => {
    if ($('#game-screen').classList.contains('active')) {
      focusInput();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
