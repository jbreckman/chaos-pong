const $ = id => document.getElementById(id);

const els = {
  scoreboard: $('scoreboard'),
  banner: $('obstacle-banner'),
  message: $('message'),
  hint: $('hint'),
  chargeWrap: $('charge-wrap'), chargeFill: $('charge-fill'),
  menu: $('menu'), gameover: $('gameover'),
  goTitle: $('gameover-title'), goScore: $('gameover-score'),
};

let msgTimer = null;
let hintTimer = null;
let ptEls = [], sideEls = [];

export const ui = {
  els,
  showScoreboard(v) { els.scoreboard.classList.toggle('show', v); },

  buildScoreboard(names, colors) {
    els.scoreboard.innerHTML = '';
    ptEls = []; sideEls = [];
    names.forEach((n, i) => {
      if (i > 0) {
        const d = document.createElement('span');
        d.className = 'divider'; d.textContent = '·';
        els.scoreboard.appendChild(d);
      }
      const side = document.createElement('div');
      side.className = 'side';
      side.innerHTML = `<span class="name">${n}</span>` +
        `<span class="pts" style="color:${colors[i]};text-shadow:0 0 18px ${colors[i]}59">0</span>` +
        `<span class="serve-dot" style="background:${colors[i]};box-shadow:0 0 8px ${colors[i]}"></span>`;
      els.scoreboard.appendChild(side);
      ptEls.push(side.querySelector('.pts'));
      sideEls.push(side);
    });
  },
  setScore(arr) { arr.forEach((v, i) => { if (ptEls[i]) ptEls[i].textContent = v; }); },
  setServer(idx) { sideEls.forEach((s, i) => s.classList.toggle('serving', i === idx)); },

  banner(labels) {
    if (labels.length === 0) {
      els.banner.textContent = '✓ CLEAN TABLE';
      els.banner.classList.add('clean');
    } else {
      els.banner.textContent = labels.join('   ');
      els.banner.classList.remove('clean');
    }
    els.banner.classList.add('show');
  },
  hideBanner() { els.banner.classList.remove('show'); },

  message(text, sub = '', dur = 1400) {
    clearTimeout(msgTimer);
    els.message.innerHTML = text + (sub ? `<span class="sub">${sub}</span>` : '');
    els.message.classList.add('show');
    if (dur > 0) msgTimer = setTimeout(() => els.message.classList.remove('show'), dur);
  },
  clearMessage() { clearTimeout(msgTimer); els.message.classList.remove('show'); },

  hint(text, dur = 0) {
    clearTimeout(hintTimer);
    els.hint.textContent = text;
    els.hint.classList.add('show');
    if (dur > 0) hintTimer = setTimeout(() => els.hint.classList.remove('show'), dur);
  },
  clearHint() { clearTimeout(hintTimer); els.hint.classList.remove('show'); },

  charge(v) {
    els.chargeWrap.classList.toggle('show', v !== null);
    if (v !== null) els.chargeFill.style.width = (v * 100).toFixed(1) + '%';
  },

  showMenu(v) { els.menu.classList.toggle('hidden', !v); },
  showGameOver(won, title, scoreText) {
    els.goTitle.textContent = title;
    els.goTitle.classList.toggle('win', won);
    els.goTitle.classList.toggle('lose', !won);
    els.goScore.textContent = scoreText;
    els.gameover.classList.remove('hidden');
  },
  hideGameOver() { els.gameover.classList.add('hidden'); },
};
