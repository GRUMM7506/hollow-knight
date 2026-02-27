// ============================================================
//  engine.js — Движок: ввод, камера, частицы, физика, аудио
// ============================================================

'use strict';

// ── Canvas Setup ─────────────────────────────────────────
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
canvas.width  = innerWidth;
canvas.height = innerHeight;
window.addEventListener('resize', () => {
  canvas.width  = innerWidth;
  canvas.height = innerHeight;
});

// ── Производительность ───────────────────────────────────
let lowPerf = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
let fpsHistory = [], lastFpsCheck = 0;
function trackFps(ts) {
  fpsHistory.push(ts);
  if (fpsHistory.length > 60) fpsHistory.shift();
  if (ts - lastFpsCheck > 2000) {
    lastFpsCheck = ts;
    if (fpsHistory.length > 10) {
      const avg = (fpsHistory[fpsHistory.length-1] - fpsHistory[0]) / (fpsHistory.length - 1);
      if (avg > 24) lowPerf = true; // <42fps → снижаем эффекты
    }
  }
}

// ── Audio ─────────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let ac = null;
function initAudio() { if (!ac) ac = new AudioCtx(); }
function snd(type) {
  if (!ac) return;
  try {
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    const t = ac.currentTime;
    const P = { type:'sine', freq:440, fEnd:440, dur:.15, vol:.1 };
    if (type==='attack') { P.type='sawtooth'; P.freq=320; P.fEnd=90; P.dur=.12; P.vol=.12; }
    else if (type==='hit')    { P.type='square';   P.freq=130; P.fEnd=80; P.dur=.2; P.vol=.18; }
    else if (type==='jump')   { P.type='sine';     P.freq=380; P.fEnd=720; P.dur=.13; P.vol=.07; }
    else if (type==='dash')   { P.type='triangle'; P.freq=640; P.fEnd=180; P.dur=.18; P.vol=.09; }
    else if (type==='death')  { P.type='sawtooth'; P.freq=180; P.fEnd=40;  P.dur=.55; P.vol=.22; }
    else if (type==='heal')   { P.type='sine';     P.freq=880; P.fEnd=1560;P.dur=.32; P.vol=.07; }
    else if (type==='magic')  { P.type='sine';     P.freq=600; P.fEnd=1400;P.dur=.2;  P.vol=.10; }
    else if (type==='mana')   { P.type='sine';     P.freq=1100;P.fEnd=1100;P.dur=.1;  P.vol=.04; }
    else if (type==='bonfire'){ P.type='sine';     P.freq=440; P.fEnd=880; P.dur=.3;  P.vol=.10; }
    else if (type==='collect'){ P.type='sine';     P.freq=660; P.fEnd=990; P.dur=.12; P.vol=.06; }
    o.type = P.type;
    o.frequency.setValueAtTime(P.freq, t);
    o.frequency.exponentialRampToValueAtTime(P.fEnd, t + P.dur);
    g.gain.setValueAtTime(P.vol, t);
    g.gain.exponentialRampToValueAtTime(.001, t + P.dur + .01);
    o.start(t); o.stop(t + P.dur + .02);
  } catch(e) {}
}

// ── Input System ─────────────────────────────────────────
class Input {
  constructor() {
    this.keys = {};
    this.just = {};
    window.addEventListener('keydown', e => {
      if (!this.keys[e.code]) this.just[e.code] = true;
      this.keys[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))
        e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
  }
  is(c)     { return !!this.keys[c]; }
  pressed(c){ const v = this.just[c] || false; this.just[c] = false; return v; }
  flush()   { this.just = {}; }
  set(c, v) { if (v && !this.keys[c]) this.just[c] = true; this.keys[c] = v; }
}
const input = new Input();

// ── Мобильные кнопки — pointer events (надёжный multi-touch) ─
// Фикс «залипания»: слушаем pointercancel и lostpointercapture
function mBtn(id, code) {
  const el = document.getElementById(id);
  if (!el) return;
  el._mCode = code; // сохраняем для глобального fallback

  el.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    initAudio(); input.set(code, true); el.classList.add('pressed');
  }, { passive: false });

  const release = e => {
    e.preventDefault();
    input.set(code, false); el.classList.remove('pressed');
  };
  el.addEventListener('pointerup',          release, { passive: false });
  el.addEventListener('pointercancel',      release, { passive: false });
  el.addEventListener('lostpointercapture', release, { passive: false });
}

// Глобальный fallback — снимаем все кнопки при потере указателя
window.addEventListener('pointerup', () => {
  document.querySelectorAll('.btn').forEach(btn => {
    if (btn._mCode) { input.set(btn._mCode, false); btn.classList.remove('pressed'); }
  });
});

mBtn('btn-left',   'ArrowLeft');
mBtn('btn-right',  'ArrowRight');
mBtn('btn-jump',   'Space');
mBtn('btn-dash',   'ShiftLeft');
mBtn('btn-attack', 'KeyZ');
mBtn('btn-magic',  'KeyC');
mBtn('btn-heal',   'KeyF');
mBtn('btn-ult',    'KeyR');
mBtn('btn-slam',   'KeyV');

// ── Camera ────────────────────────────────────────────────
class Camera {
  constructor() { this.x = 0; this.y = 0; this.sx = 0; this.sy = 0; this.sa = 0; }

  // Стандартный трекинг за игроком
  follow(t, W, H) {
    const tx = t.x + t.w * .5 - canvas.width * .5;
    const ty = t.y + t.h * .5 - canvas.height * .5;
    this.x += (tx - this.x) * .1;
    this.y += (ty - this.y) * .1;
    this.x = Math.max(0, Math.min(W - canvas.width,  this.x));
    this.y = Math.max(0, Math.min(H - canvas.height, this.y));
  }

  // Фикс камеры на боссе: фиксируем X по центру арены, Y мягко следит за игроком
  followBoss(gateX, zoneW, zoneH, player, dt) {
    const arenaCenterX = gateX + (zoneW - gateX) * .5;
    const targetX = arenaCenterX - canvas.width * .5;
    // Плавное смещение по X (lerp с учётом dt)
    this.x += (targetX - this.x) * Math.min(.04 * dt, .15);
    this.x = Math.max(0, Math.min(zoneW - canvas.width, this.x));
    // Мягкий трекинг по Y чтобы прыжки были видны
    const targetY = player.y + player.h * .5 - canvas.height * .5;
    this.y += (targetY - this.y) * Math.min(.08 * dt, .2);
    this.y = Math.max(0, Math.min(zoneH - canvas.height, this.y));
  }

  shake(a) { this.sa = Math.max(this.sa, a); }
  update() {
    if (this.sa > .2) {
      this.sx = (Math.random() - .5) * this.sa * 2;
      this.sy = (Math.random() - .5) * this.sa * 2;
      this.sa *= .8;
    } else { this.sx = 0; this.sy = 0; this.sa = 0; }
  }
  apply() { ctx.setTransform(1, 0, 0, 1, -this.x + this.sx, -this.y + this.sy); }
  reset() { ctx.setTransform(1, 0, 0, 1, 0, 0); }
}
const cam = new Camera();

// ── Object Pool — универсальный пул объектов ──────────────
class ObjectPool {
  constructor(factory, reset, maxSize = 64) {
    this.factory  = factory;
    this.reset    = reset;
    this.maxSize  = maxSize;
    this.inactive = [];
  }
  get(...args) {
    const obj = this.inactive.length > 0 ? this.inactive.pop() : this.factory();
    this.reset(obj, ...args);
    return obj;
  }
  release(obj) {
    if (this.inactive.length < this.maxSize) this.inactive.push(obj);
  }
}

// ── Particles (с пулом объектов) ─────────────────────────
const MAX_PARTICLES = 120;
class Particles {
  constructor() {
    this.p = [];
    // Пул для частиц — избегаем GC при высокой нагрузке
    this._pool = [];
  }
  _alloc() {
    return this._pool.pop() || { x:0,y:0,dx:0,dy:0,life:1,dec:.03,size:4,color:'#fff',grav:.1 };
  }
  _free(p) { if (this._pool.length < 200) this._pool.push(p); }

  emit(x, y, n, o = {}) {
    const count = lowPerf ? Math.ceil(n * .45) : n;
    const cap   = lowPerf ? 60 : MAX_PARTICLES;
    if (this.p.length > cap) return;
    for (let i = 0; i < count; i++) {
      const a = (o.angle || 0) + (Math.random() - .5) * (o.spread || Math.PI * 2);
      const s = (o.speed || 3) + Math.random() * (o.sv || 2);
      const pt = this._alloc();
      pt.x = x; pt.y = y;
      pt.dx = Math.cos(a) * s;
      pt.dy = Math.sin(a) * s - (o.up || 0);
      pt.life = 1;
      pt.dec  = .028 + Math.random() * .02;
      pt.size = (o.size || 4) + Math.random() * 2;
      pt.color = o.color || '#c9a0dc';
      pt.grav  = o.grav !== undefined ? o.grav : .1;
      this.p.push(pt);
    }
  }
  update(dt) {
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i];
      p.dy += p.grav;
      p.x  += p.dx * dt; p.y += p.dy * dt;
      p.dx *= .97;
      p.life -= p.dec * dt;
      if (p.life <= 0) { this._free(p); this.p.splice(i, 1); }
    }
  }
  draw() {
    ctx.save();
    for (const p of this.p) {
      ctx.globalAlpha = p.life * .88;
      ctx.fillStyle = p.color;
      if (!lowPerf) { ctx.shadowColor = p.color; ctx.shadowBlur = 6; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
  }
}
const pts = new Particles();

// ── Физика — коллизии ────────────────────────────────────
// Проверка перекрытия двух AABB
function ov(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}
// Разрешение перекрытия: возвращает сторону столкновения
function res(e, p) {
  const ox = Math.min(e.x + e.w, p.x + p.w) - Math.max(e.x, p.x);
  const oy = Math.min(e.y + e.h, p.y + p.h) - Math.max(e.y, p.y);
  if (ox <= 0 || oy <= 0) return null;
  if (ox < oy) {
    if (e.x < p.x) { e.x -= ox; if (e.dx > 0) e.dx = 0; return 'L'; }
    else           { e.x += ox; if (e.dx < 0) e.dx = 0; return 'R'; }
  } else {
    if (e.y < p.y) { e.y -= oy; if (e.dy > 0) e.dy = 0; e.grounded = true; return 'T'; }
    else           { e.y += oy; if (e.dy < 0) e.dy = 0; return 'B'; }
  }
}

// ── HUD Helpers ───────────────────────────────────────────
function updateHearts(l, m) {
  const el = document.getElementById('hearts');
  el.innerHTML = '';
  for (let i = 0; i < m; i++) {
    const d = document.createElement('div');
    d.className = 'heart' + (i >= l ? ' dead' : '');
    el.appendChild(d);
  }
}
function updateSp(s, m) {
  const el = document.getElementById('stamina-bar');
  el.innerHTML = '';
  for (let i = 0; i < m; i++) {
    const d = document.createElement('div');
    d.className = 'soul' + (i < s ? ' full' : '');
    el.appendChild(d);
  }
}
function updateMana(mn, mx) {
  document.getElementById('mana-fill').style.width = (mn / mx * 100) + '%';
}
function updateBoss(h, m, name) {
  document.getElementById('boss-fill').style.width = (Math.max(0,h) / m * 100) + '%';
  if (name) document.getElementById('boss-name').textContent = '✦ ' + name + ' ✦';
}
function updateSoulsHUD(s) {
  document.getElementById('souls-hud').textContent = '✦ ' + s;
}

// Плавающий текст (позиция в мировых координатах)
function floatTxt(wx, wy, txt, col) {
  const el = document.createElement('div');
  el.className = 'floattext';
  el.style.color = col || '#fff';
  el.style.left  = (wx - cam.x) + 'px';
  el.style.top   = (wy - cam.y) + 'px';
  el.textContent = txt;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}
// Плавающий текст в центре экрана
function floatTxtGlobal(txt, col) {
  const el = document.createElement('div');
  el.className = 'floattext';
  el.style.color = col || '#fff';
  el.style.left  = '50%';
  el.style.top   = '40%';
  el.style.transform = 'translateX(-50%)';
  el.textContent = txt;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// Parry HUD
function updateParryHUD(parryCD, parryWindow, PARRY_CD) {
  const bar  = document.getElementById('parry-bar');
  const fill = document.getElementById('parry-fill');
  if (!bar || !fill) return;
  bar.style.display = 'flex';
  fill.style.width  = parryCD > 0 ? ((1 - parryCD / PARRY_CD) * 100) + '%' : '100%';
  if (parryWindow > 0) {
    bar.style.opacity = '1'; fill.style.background = '#ffffff';
  } else {
    bar.style.opacity = '.7'; fill.style.background = '#88ccff';
  }
}

// ── Save / Load ───────────────────────────────────────────
let saveData = {
  souls: 0,
  upgrades: { hp:0, mana:0, atkPow:0, magicPow:0, dashRange:0, healCost:0 },
  zonesCleared: [],
  checkpoint: null
};
function saveGame() {
  try { localStorage.setItem('hollow_save', JSON.stringify(saveData)); } catch(e) {}
}
function loadGame() {
  try {
    const d = localStorage.getItem('hollow_save');
    if (d) saveData = Object.assign(saveData, JSON.parse(d));
  } catch(e) {}
}
loadGame();

// ── Fullscreen ────────────────────────────────────────────
function toggleFS() {
  const el = document.documentElement;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen).call(document);
  }
  try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); } catch(e) {}
}
document.getElementById('fs-btn').addEventListener('click', toggleFS);
document.getElementById('fs-btn').addEventListener('touchend', e => { e.preventDefault(); toggleFS(); }, { passive: false });