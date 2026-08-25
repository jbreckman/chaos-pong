const $ = id => document.getElementById(id);

const els = {
  scoreboard: $('scoreboard'),
  ptsYou: $('pts-you'), ptsBot: $('pts-bot'),
  sideYou: $('score-you'), sideBot: $('score-bot'),
  banner: $('obstacle-banner'),
  message: $('message'),
  hint: $('hint'),
  chargeWrap: $('charge-wrap'), chargeFill: $('charge-fill'),
  menu: $('menu'), gameover: $('gameover'),
  goTitle: $('gameover-title'), goScore: $('gameover-score'),
};

let msgTimer = null;
let hintTimer = null;

export const ui = {
  els,
  showScoreboard(v) { els.scoreboard.classList.toggle('show', v); },
  setScore(you, bot) {
    els.ptsYou.textContent = you;
    els.ptsBot.textContent = bot;
  },
  setServer(server) {
    els.sideYou.classList.toggle('serving', server === 'you');
    els.sideBot.classList.toggle('serving', server === 'bot');
  },
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
  showGameOver(won, you, bot) {
    els.goTitle.textContent = won ? 'YOU WIN!' : 'BOT WINS';
    els.goTitle.className = won ? 'win' : 'lose';
    els.goTitle.id = 'gameover-title';
    els.goScore.textContent = `${you} — ${bot}`;
    els.gameover.classList.remove('hidden');
  },
  hideGameOver() { els.gameover.classList.add('hidden'); },
};
