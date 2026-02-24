(function () {
  'use strict';

  let allRuns = [];
  let activeCategory = 'standard';
  let activePlatform = 'all';
  let sortField = 'time';
  let sortAsc = true;

  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.nav-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var section = tab.getAttribute('data-section');
      document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
      document.getElementById(section).classList.add('active');
    });
  });

  // Category tabs
  document.querySelectorAll('.cat-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.cat-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeCategory = tab.getAttribute('data-category');
      render();
    });
  });

  // Platform pills
  document.querySelectorAll('.pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      document.querySelectorAll('.pill').forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      activePlatform = pill.getAttribute('data-platform');
      render();
    });
  });

  // Sort headers
  document.querySelectorAll('th.sortable').forEach(function (th) {
    th.addEventListener('click', function () {
      var field = th.getAttribute('data-sort');
      if (sortField === field) {
        sortAsc = !sortAsc;
      } else {
        sortField = field;
        sortAsc = true;
      }
      document.querySelectorAll('th.sortable').forEach(function (h) { h.classList.remove('active-sort'); });
      th.classList.add('active-sort');
      render();
    });
  });

  function filterRuns() {
    return allRuns.filter(function (run) {
      if (run.category !== activeCategory) return false;
      if (activePlatform !== 'all' && run.platform !== activePlatform) return false;
      return true;
    });
  }

  function sortRuns(runs) {
    var sorted = runs.slice();
    sorted.sort(function (a, b) {
      var va, vb;
      if (sortField === 'time') {
        va = a.time_seconds;
        vb = b.time_seconds;
      } else if (sortField === 'date') {
        va = a.date;
        vb = b.date;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return sorted;
  }

  function findWR(runs) {
    if (runs.length === 0) return null;
    var best = runs[0].time_seconds;
    for (var i = 1; i < runs.length; i++) {
      if (runs[i].time_seconds < best) best = runs[i].time_seconds;
    }
    return best;
  }

  function render() {
    var filtered = filterRuns();
    var sorted = sortRuns(filtered);
    var wr = findWR(filtered);

    var tbody = document.getElementById('leaderboard-body');
    var noRuns = document.getElementById('no-runs');

    if (sorted.length === 0) {
      tbody.innerHTML = '';
      noRuns.hidden = false;
      return;
    }

    noRuns.hidden = true;

    // Compute ranks (by time ascending, ties get same rank)
    var byTime = sorted.slice().sort(function (a, b) { return a.time_seconds - b.time_seconds; });
    var rankMap = {};
    var currentRank = 1;
    for (var i = 0; i < byTime.length; i++) {
      if (i > 0 && byTime[i].time_seconds !== byTime[i - 1].time_seconds) {
        currentRank = i + 1;
      }
      var key = byTime[i].runner + '|' + byTime[i].time_seconds + '|' + byTime[i].date;
      rankMap[key] = currentRank;
    }

    var html = '';
    for (var j = 0; j < sorted.length; j++) {
      var run = sorted[j];
      var key = run.runner + '|' + run.time_seconds + '|' + run.date;
      var rank = rankMap[key];
      var isWR = run.time_seconds === wr;

      html += '<tr>';
      html += '<td class="col-rank' + (isWR ? ' wr' : '') + '">';
      html += isWR ? '<span class="wr-badge" title="World Record">&#9733;</span> ' + rank : rank;
      html += '</td>';
      html += '<td class="col-runner"><a href="' + escapeHtml(run.github) + '" target="_blank" rel="noopener">' + escapeHtml(run.runner) + '</a></td>';
      html += '<td class="col-time">' + escapeHtml(run.time_display) + '</td>';
      html += '<td class="col-platform">' + escapeHtml(run.platform) + '</td>';
      html += '<td class="col-date">' + escapeHtml(run.date) + '</td>';
      html += '<td class="col-proof">';
      if (run.proof) {
        html += '<a href="' + escapeHtml(run.proof) + '" target="_blank" rel="noopener">view</a>';
      } else {
        html += '<span style="color:var(--muted)">-</span>';
      }
      html += '</td>';
      html += '</tr>';
    }

    tbody.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Load data
  fetch('data/leaderboard.json')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      allRuns = data.runs || [];
      render();
    })
    .catch(function () {
      document.getElementById('no-runs').hidden = false;
      document.getElementById('no-runs').textContent = 'Failed to load leaderboard data.';
    });
})();
