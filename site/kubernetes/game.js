// ══════════════════════════════════════════════════
//  Kubernetes: The Reload — Game Engine
// ══════════════════════════════════════════════════

const GAME = {
  currentLevel: 0,
  currentChallenge: 0,
  inBoss: false,
  completed: JSON.parse(localStorage.getItem('kubernetes-reload-completed') || '[]'),
  history: [],
  historyIndex: -1,
  hintCount: 0,
};

function saveProgress() {
  localStorage.setItem('kubernetes-reload-completed', JSON.stringify(GAME.completed));
}

// ─── UI Helpers ──────────────────────────────────

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function clearTerminal() {
  $('#terminal-output-inner').innerHTML = '';
}

function printToTerminal(text, className) {
  const inner = $('#terminal-output-inner');
  const outer = $('#terminal-output');
  const line = document.createElement('div');
  line.className = 'term-line ' + (className || '');
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
  chibi.classList.add('chibi-' + mood);
}

function updatePrompt() {
  $('#terminal-prompt').innerHTML = 'kit@cluster:' + CLUSTER.currentNamespace + '$&nbsp;';
}

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#' + id).classList.add('active');
}

// ─── Level Select ────────────────────────────────

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
    card.innerHTML =
      '<div class="level-number">' + (isCompleted ? '&#10003;' : (isUnlocked ? (i + 1) : '&#128274;')) + '</div>' +
      '<div class="level-name">' + level.name + '</div>' +
      '<div class="level-subtitle">' + level.subtitle + '</div>';
    if (isUnlocked) {
      card.addEventListener('click', () => startLevel(i));
    }
    container.appendChild(card);
  });
}

// ─── Level Start ─────────────────────────────────

function startLevel(index) {
  GAME.currentLevel = index;
  GAME.currentChallenge = 0;
  GAME.inBoss = false;
  GAME.history = [];
  GAME.historyIndex = -1;

  resetCluster();

  const level = LEVELS[index];
  $('#game-level-name').textContent = 'Level ' + (index + 1) + ': ' + level.name;
  $('#game-level-subtitle').textContent = level.subtitle;
  $('#game-chibi').src = level.chibi;
  $('#game-chibi').alt = level.subtitle;

  clearTerminal();
  printToTerminal('\n  \u2550\u2550\u2550 Level ' + (index + 1) + ': ' + level.name + ' \u2550\u2550\u2550', 'header');
  printToTerminal('  ' + level.subtitle + '\n', 'subtitle');
  printToTerminal('  ' + level.intro + '\n', 'intro');
  showChallenge();
  showScreen('game-screen');
  updatePrompt();
  focusInput();
}

// ─── Challenge Display ───────────────────────────

function showChallenge() {
  GAME.hintCount = 0;
  const level = LEVELS[GAME.currentLevel];
  if (GAME.inBoss) {
    const boss = level.boss;
    $('#challenge-counter').textContent = 'BOSS';
    $('#challenge-counter').classList.add('boss-counter');
    printToTerminal('\n  \u25C6 BOSS: ' + boss.name + ' \u25C6', 'boss-name');
    printToTerminal('  ' + boss.intro + '\n', 'challenge');
    updateChibiExpression('boss');
  } else {
    const challenge = level.challenges[GAME.currentChallenge];
    const total = level.challenges.length;
    $('#challenge-counter').textContent = (GAME.currentChallenge + 1) + '/' + total;
    $('#challenge-counter').classList.remove('boss-counter');
    printToTerminal('  \u25B8 Challenge ' + (GAME.currentChallenge + 1) + '/' + total, 'challenge-num');
    printToTerminal('  ' + challenge.prompt + '\n', 'challenge');
    updateChibiExpression('thinking');
  }
}

// ─── Input Handling ──────────────────────────────

function handleInput(input) {
  if (!input.trim()) return;

  GAME.history.push(input);
  GAME.historyIndex = GAME.history.length;

  printToTerminal('kit@cluster:' + CLUSTER.currentNamespace + '$ ' + input, 'input-echo');

  if (input.trim() === 'hint') {
    GAME.hintCount++;
    const level = LEVELS[GAME.currentLevel];
    const challenge = GAME.inBoss ? level.boss : level.challenges[GAME.currentChallenge];
    if (GAME.hintCount >= 2 && challenge.answer) {
      printToTerminal('  \uD83D\uDCA1 ' + challenge.hint, 'hint');
      printToTerminal('  \u27F6  ' + challenge.answer + '\n', 'answer');
    } else {
      printToTerminal('  \uD83D\uDCA1 ' + challenge.hint + '\n', 'hint');
    }
    return;
  }

  // Handle && chaining
  const commands = input.split('&&').map(s => s.trim()).filter(Boolean);
  let lastOutput = '';
  for (const cmd of commands) {
    const result = executeCommand(cmd);
    if (result.clear) {
      clearTerminal();
    } else if (result.output) {
      printToTerminal(result.output, 'output');
      lastOutput = result.output;
    }
  }
  updatePrompt();

  const level = LEVELS[GAME.currentLevel];
  if (GAME.inBoss) {
    if (level.boss.check(input)) {
      if (level.boss.successMsg) {
        printToTerminal('\n  \u2726 ' + level.boss.successMsg, 'success');
      }
      completeBoss();
    }
  } else {
    const challenge = level.challenges[GAME.currentChallenge];
    if (challenge.check(input, lastOutput)) {
      printToTerminal('\n  \u2713 ' + challenge.successMsg, 'success');
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

// ─── Boss Completion ─────────────────────────────

function completeBoss() {
  const level = LEVELS[GAME.currentLevel];
  if (!GAME.completed.includes(level.id)) {
    GAME.completed.push(level.id);
    saveProgress();
  }
  updateChibiExpression('victory');

  const isLastLevel = GAME.currentLevel === LEVELS.length - 1;

  if (isLastLevel) {
    printToTerminal('\n  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'victory');
    printToTerminal('  \u2726 Congratulations! \u2726', 'victory-title');
    printToTerminal('  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n', 'victory');
    printToTerminal('  You drained the node. The cluster survived.', 'victory');
    printToTerminal('  Your fingers remembered kubectl like they never left.\n', 'victory');
    printToTerminal('  Now go make your on-call rotations wonder', 'victory');
    printToTerminal('  if you ever stopped being dangerous.\n', 'victory');
  } else {
    printToTerminal('\n  \u2550\u2550 Level ' + (GAME.currentLevel + 1) + ' Complete \u2550\u2550', 'victory');
    printToTerminal('  Boss defeated: ' + level.boss.name + '\n', 'victory');
  }

  setTimeout(() => {
    showScreen('level-select');
    renderLevelSelect();
  }, isLastLevel ? 4000 : 2500);
}

// ─── Tab Completion ──────────────────────────────

function tabComplete(input) {
  const parts = input.split(/\s+/);
  const partial = parts[parts.length - 1] || '';

  if (parts.length <= 1) {
    const cmds = ['kubectl', 'clear', 'help', 'hint'].filter(c => c.startsWith(partial));
    if (cmds.length === 1) return { completed: cmds[0] + ' ', completions: cmds };
    if (cmds.length > 1) return { completed: commonPrefix(cmds), completions: cmds };
    return { completed: input, completions: [] };
  }

  if (parts[0] === 'kubectl' && parts.length === 2) {
    const subcmds = ['get', 'describe', 'logs', 'create', 'run', 'apply', 'delete', 'scale', 'rollout', 'expose', 'exec', 'port-forward', 'config', 'top', 'label', 'cordon', 'uncordon', 'drain'];
    const matches = subcmds.filter(c => c.startsWith(partial));
    const before = parts.slice(0, -1).join(' ') + ' ';
    if (matches.length === 1) return { completed: before + matches[0] + ' ', completions: matches };
    if (matches.length > 1) return { completed: before + commonPrefix(matches), completions: matches };
    return { completed: input, completions: [] };
  }

  if (parts[0] === 'kubectl' && (parts[1] === 'get' || parts[1] === 'describe' || parts[1] === 'delete' || parts[1] === 'top') && parts.length === 3) {
    const resources = ['pods', 'nodes', 'services', 'deployments', 'namespaces', 'configmaps', 'secrets', 'events', 'all'];
    const matches = resources.filter(r => r.startsWith(partial));
    const before = parts.slice(0, -1).join(' ') + ' ';
    if (matches.length === 1) return { completed: before + matches[0] + ' ', completions: matches };
    if (matches.length > 1) return { completed: before + commonPrefix(matches), completions: matches };
  }

  return { completed: input, completions: [] };
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
  backupCluster();
  renderLevelSelect();

  $('#terminal-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const input = e.target.value;
      e.target.value = '';
      handleInput(input);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const result = tabComplete(e.target.value);
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
