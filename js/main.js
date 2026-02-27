// ============================================================
//  main.js — Точка входа, игровой цикл, управление состояниями
//  ENHANCED: Эпические фоны, эмбиент, атмосфера
// ============================================================

'use strict';

// ── Состояния игры — вместо разрозненных флагов ───────────
const GameState = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  DIALOG: 'DIALOG',
  SHOP: 'SHOP',
  DEAD: 'DEAD',
  MAP: 'MAP'
};
let state = GameState.MENU;
let lastT = 0;

// ── Игровые переменные ────────────────────────────────────
let curZone = null;    // текущая зона (объект)
let curPlats = [];
let curSpikes = [];
let curBonfires = [];
let curEnemies = [];
let curBoss = null;
let player = null;
let drops = [];

// Арена и босс
let curGateX = 0;       // X ворот арены
let bossActive = false;
let arenaWalls = [];
let _arenaLocked = false;  // флаг: ворота уже закрыты

// Системы
let parryWindow = 0, parryCD = 0;
const PARRY_WINDOW = 14, PARRY_CD = 90;

let dialogSeenZones = {};

// ── Ambient Particles System ──────────────────────────────
let ambientParticles = [];
const MAX_AMBIENT = 80;

function initAmbientParticles(zone) {
  ambientParticles = [];
  for (let i = 0; i < MAX_AMBIENT; i++) {
    ambientParticles.push(createAmbientParticle(zone, true));
  }
}

function createAmbientParticle(zone, initial) {
  const p = {
    x: initial ? Math.random() * zone.W : cam.x + Math.random() * canvas.width,
    y: initial ? Math.random() * zone.H : cam.y - 20 + Math.random() * (canvas.height + 40),
    size: 1 + Math.random() * 3,
    speed: 0.15 + Math.random() * 0.4,
    drift: (Math.random() - 0.5) * 0.3,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.1 + Math.random() * 0.4,
    life: 300 + Math.random() * 600,
    maxLife: 300 + Math.random() * 600,
  };
  if (zone.id === 'abyss') {
    p.color = Math.random() < 0.6 ? '#b080ff' : '#60c0ff';
    p.speed *= 0.7;
    p.glow = true;
  } else if (zone.id === 'catacombs') {
    p.color = Math.random() < 0.5 ? '#ff8830' : '#ffcc44';
    p.speed *= 0.5;
    p.glow = true;
    p.rising = true;
  } else {
    p.color = Math.random() < 0.4 ? '#80ddff' : '#ffffff';
    p.speed *= 1.2;
    p.glow = Math.random() < 0.3;
  }
  return p;
}

function updateAmbientParticles(zone, dt) {
  const t = Date.now() * 0.001;
  for (let i = ambientParticles.length - 1; i >= 0; i--) {
    const p = ambientParticles[i];
    p.life -= dt;
    if (p.rising) {
      p.y -= p.speed * dt;
      p.x += Math.sin(t + p.phase) * p.drift * dt;
    } else {
      p.y += p.speed * dt * 0.5;
      p.x += (p.drift + Math.sin(t * 0.5 + p.phase) * 0.2) * dt;
    }
    if (p.life <= 0 || p.y < cam.y - 50 || p.y > cam.y + canvas.height + 50) {
      ambientParticles[i] = createAmbientParticle(zone, false);
    }
  }
}

function drawAmbientParticles() {
  for (const p of ambientParticles) {
    const sx = p.x, sy = p.y;
    if (sx < cam.x - 20 || sx > cam.x + canvas.width + 20 ||
      sy < cam.y - 20 || sy > cam.y + canvas.height + 20) continue;
    const fadeIn = Math.min(1, (p.maxLife - p.life) / 60);
    const fadeOut = Math.min(1, p.life / 60);
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.003 + p.phase);
    ctx.globalAlpha = p.alpha * fadeIn * fadeOut * pulse;
    ctx.fillStyle = p.color;
    if (p.glow && !lowPerf) {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.size * 4;
    }
    ctx.beginPath();
    ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

// ── Ambient Sound Drone ───────────────────────────────────
let ambientDrone = null;
let ambientGain = null;
function startAmbientDrone(zone) {
  if (!ac) return;
  stopAmbientDrone();
  try {
    const o1 = ac.createOscillator();
    const o2 = ac.createOscillator();
    const g = ac.createGain();
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 200;
    o1.type = 'sine';
    o2.type = 'sine';
    if (zone.id === 'abyss') { o1.frequency.value = 55; o2.frequency.value = 82.5; }
    else if (zone.id === 'catacombs') { o1.frequency.value = 48; o2.frequency.value = 72; }
    else { o1.frequency.value = 65; o2.frequency.value = 97.5; }
    g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(ac.destination);
    o1.start(); o2.start();
    g.gain.linearRampToValueAtTime(0.03, ac.currentTime + 2);
    ambientDrone = [o1, o2];
    ambientGain = g;
  } catch (e) { }
}
function stopAmbientDrone() {
  if (ambientDrone) {
    try {
      if (ambientGain) ambientGain.gain.linearRampToValueAtTime(0.001, ac.currentTime + 0.5);
      ambientDrone.forEach(o => { try { o.stop(ac.currentTime + 0.6); } catch (e) { } });
    } catch (e) { }
    ambientDrone = null; ambientGain = null;
  }
}

// ── Вспомогательные ──────────────────────────────────────
// Экспортируем curZone.id для ui.js
Object.defineProperty(window, '_curZoneId', { get: () => curZone ? curZone.id : 'abyss' });

// Колбэк для кнопки магазина у костра (вызывается из ui.js)
window.onBonfireShopClick = () => {
  if (state !== GameState.PLAYING) return;
  state = GameState.SHOP;
  hideBonfirePopup();
  openShopAtBonfire();
};

// Колбэк "продолжить игру" из UI
window.resumeGame = () => {
  state = GameState.PLAYING;
  lastT = performance.now();
  requestAnimationFrame(loop);
};
window.pauseGame = () => { state = GameState.PAUSED; };

// ── Parry System ─────────────────────────────────────────
function tryParry() {
  if (parryCD > 0) return false;
  parryWindow = PARRY_WINDOW; parryCD = PARRY_CD;
  pts.emit(player.cx, player.cy, lowPerf ? 8 : 16,
    { color: '#88ccff', speed: 4, spread: Math.PI * 2, grav: 0, size: 3 });
  return true;
}

// ── Arena Lock / Unlock ───────────────────────────────────
function lockArena(gx) {
  if (_arenaLocked) return;
  _arenaLocked = true;
  arenaWalls = [{ x: gx, y: 0, w: 20, h: 9999, t: 'W' }];
  floatTxtGlobal('⚠ ВЫХОД ЗАБЛОКИРОВАН', '#ff4444');
}
function unlockArena() {
  arenaWalls = [];
  _arenaLocked = false;
  floatTxtGlobal('✓ АРЕНА ОТКРЫТА', '#a0ffa0');
}

// ── Drop Spawning ─────────────────────────────────────────
function spawnDrop(x, y, hp) {
  const r = Math.random();
  if (r < .15) drops.push(new DropItem(x, y, 'large'));
  else if (r < .45) drops.push(new DropItem(x, y, 'medium'));
  else drops.push(new DropItem(x, y, 'small'));
}

// ── Zone Start / Load ─────────────────────────────────────
function startZone(zoneId) {
  document.getElementById('world-map-screen').classList.add('hidden');
  const zoneDef = ZONE_DEFS[zoneId];
  curZone = zoneDef;
  if (dialogSeenZones[zoneId]) {
    loadZone(zoneId);
  } else {
    dialogSeenZones[zoneId] = true;
    state = GameState.DIALOG;
    showDialog(zoneDef.dialog.npc, zoneDef.dialog.lines, () => loadZone(zoneId));
  }
}
window.startZone = startZone;

function loadZone(zoneId) {
  const zoneDef = ZONE_DEFS[zoneId];
  curZone = zoneDef;
  curPlats = zoneDef.plats;
  curSpikes = zoneDef.spikes;
  drops = []; pts.p = [];
  cam.x = 0; cam.y = 0; cam.sa = 0;

  // Костры
  curBonfires = zoneDef.bonfires.map(b => new Bonfire(b.x, b.y));
  if (saveData.checkpoint && saveData.checkpoint.zone === zoneId) {
    const cbf = saveData.checkpoint.bonfireIdx;
    if (cbf !== undefined && curBonfires[cbf]) curBonfires[cbf].lit = true;
  }

  // Враги
  curEnemies = zoneDef.enemies.map(e => makeEnemy(e, zoneDef.GY));

  // Босс
  curBoss = makeBoss(zoneDef.bossType, zoneDef.bossX, zoneDef.bossY);
  // Фикс арены: ворота стоят на 400px левее босса
  curGateX = zoneDef.bossX - 400;
  bossActive = false;
  arenaWalls = [];
  _arenaLocked = false;
  parryWindow = 0; parryCD = 0;
  document.getElementById('boss-bar').style.display = 'none';

  // Игрок
  let spawnX = zoneDef.playerStart[0], spawnY = zoneDef.playerStart[1];
  if (saveData.checkpoint && saveData.checkpoint.zone === zoneId) {
    spawnX = saveData.checkpoint.x; spawnY = saveData.checkpoint.y;
  }
  player = new Player(spawnX, spawnY);

  updateHearts(player.lives, player.maxLives);
  updateSp(player.sp, player.maxSp);
  updateMana(player.mana, player.maxMana);
  updateSoulsHUD(saveData.souls);
  document.getElementById('boss-bar').style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  document.getElementById('controls').style.display = 'block';

  // Ambient
  initAmbientParticles(zoneDef);
  startAmbientDrone(zoneDef);

  // Cinematic вход в зону
  showZoneLabel(zoneDef.name, zoneDef.sub, () => {
    state = GameState.PLAYING;
    lastT = performance.now();
    requestAnimationFrame(loop);
  });
}
window.loadZone = loadZone;

// ── Respawn / Game Over ───────────────────────────────────
function respawnOrGameOver() {
  state = GameState.DEAD;
  if (saveData.checkpoint && saveData.checkpoint.zone === curZone.id) {
    player.alive = true; player.deathTimer = 0;
    player.x = saveData.checkpoint.x;
    player.y = saveData.checkpoint.y;
    player.lives = Math.ceil(player.maxLives * .5);
    player.dx = 0; player.dy = 0; player.inv = 0;
    updateHearts(player.lives, player.maxLives);
    const idx = saveData.checkpoint.bonfireIdx;
    if (idx !== undefined && curBonfires[idx]) curBonfires[idx].lit = true;
    curEnemies = curZone.enemies.map(def => makeEnemy(def, curZone.GY));
    if (curBoss && !curBoss.alive) curBoss = null;
    parryWindow = 0; parryCD = 0;
    arenaWalls = [];
    _arenaLocked = false;
    bossActive = false;
    if (curBoss && curBoss.alive) {
      curBoss.appeared = false;
      document.getElementById('boss-bar').style.display = 'none';
    }
    floatTxt(player.cx, player.y - 40, '🔥 Возрождение', '#ff9944');
    state = GameState.PLAYING;
    lastT = performance.now();
    requestAnimationFrame(loop);
  } else {
    showDeathScreen();
  }
}

// ── Zone Clear ────────────────────────────────────────────
function zoneClear() {
  state = GameState.MAP;
  if (!saveData.zonesCleared.includes(curZone.id))
    saveData.zonesCleared.push(curZone.id);
  const nextIdx = ZONE_ORDER.indexOf(curZone.id) + 1;
  saveGame();
  showZoneClearScreen(curZone.name, nextIdx);
}

// ══════════════════════════════════════════════════════════
//  EPIC BACKGROUND RENDERING
// ══════════════════════════════════════════════════════════

function drawBG(zone) {
  const c = cam;
  const t = Date.now() * 0.001;
  const W = canvas.width, H = canvas.height;

  // ── 1) Sky gradient (deep, rich)
  const skyGrad = ctx.createLinearGradient(c.x, c.y, c.x, c.y + H);
  if (zone.id === 'abyss') {
    skyGrad.addColorStop(0, '#020008');
    skyGrad.addColorStop(0.3, '#0a0420');
    skyGrad.addColorStop(0.7, '#150a38');
    skyGrad.addColorStop(1, '#1a0840');
  } else if (zone.id === 'catacombs') {
    skyGrad.addColorStop(0, '#0a0604');
    skyGrad.addColorStop(0.4, '#1a0e06');
    skyGrad.addColorStop(1, '#2a1408');
  } else {
    skyGrad.addColorStop(0, '#020610');
    skyGrad.addColorStop(0.3, '#041020');
    skyGrad.addColorStop(0.7, '#081830');
    skyGrad.addColorStop(1, '#0c2040');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(c.x, c.y, W, H);

  // ── 2) Stars (Abyss + Peaks)
  if (zone.stars) {
    // Far stars — very slow parallax
    for (let i = 0; i < 180; i++) {
      const wx = (i * 557 + i * i * 13) % zone.W;
      const wy = (i * 311 + i * 7) % (zone.H * 0.6);
      const sx = wx - c.x * 0.02;
      const sy = wy - c.y * 0.01 + c.y * 0.3;
      if (sx < c.x - 5 || sx > c.x + W + 5 || sy < c.y || sy > c.y + H) continue;
      const twinkle = 0.15 + 0.55 * Math.sin(t * 0.8 + i * 1.7);
      const size = (i % 5 === 0) ? 2.5 : (i % 3 === 0) ? 1.8 : 1;
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = (i % 7 === 0) ? '#c8b8ff' : (i % 11 === 0) ? '#ff88cc' : '#e0d8ff';
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Nebula clouds
    if (!lowPerf) {
      for (let i = 0; i < 4; i++) {
        const nx = (i * 1300 + 400) - c.x * 0.03;
        const ny = c.y * 0.8 + 100 + i * 150;
        const nR = 180 + i * 40;
        ctx.globalAlpha = 0.04 + 0.02 * Math.sin(t * 0.3 + i);
        const nebGrad = ctx.createRadialGradient(nx, ny, 0, nx, ny, nR);
        if (zone.id === 'abyss') {
          nebGrad.addColorStop(0, 'rgba(120,40,200,0.5)');
          nebGrad.addColorStop(0.5, 'rgba(80,20,160,0.2)');
          nebGrad.addColorStop(1, 'rgba(40,10,80,0)');
        } else {
          nebGrad.addColorStop(0, 'rgba(0,120,200,0.4)');
          nebGrad.addColorStop(0.5, 'rgba(0,60,140,0.15)');
          nebGrad.addColorStop(1, 'rgba(0,30,80,0)');
        }
        ctx.fillStyle = nebGrad;
        ctx.beginPath();
        ctx.ellipse(nx, ny, nR * 1.6, nR, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ── 3) Distant mountain silhouettes (3 layers, parallax)
  const mountains = zone.mountains || [];
  for (let layer = 0; layer < 3; layer++) {
    const parallax = 0.04 + layer * 0.06;
    const baseY = c.y + H * (0.35 + layer * 0.15);
    const color = zone.id === 'abyss'
      ? [`rgba(20,10,50,${0.3 + layer * 0.15})`, `rgba(30,15,60,${0.25 + layer * 0.15})`, `rgba(40,20,70,${0.2 + layer * 0.15})`][layer]
      : zone.id === 'catacombs'
        ? [`rgba(30,18,8,${0.35 + layer * 0.15})`, `rgba(40,24,12,${0.3 + layer * 0.15})`, `rgba(50,30,15,${0.25 + layer * 0.15})`][layer]
        : [`rgba(8,20,40,${0.4 + layer * 0.15})`, `rgba(12,28,50,${0.35 + layer * 0.15})`, `rgba(16,36,60,${0.3 + layer * 0.15})`][layer];

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y + H + 10);
    const segW = 120 + layer * 60;
    const amp = 80 + (2 - layer) * 60;
    for (let x = c.x - segW; x <= c.x + W + segW; x += 6) {
      const wx = x + c.x * parallax;
      const h = Math.sin(wx * 0.003 + layer * 2) * amp
        + Math.sin(wx * 0.007 + layer * 5) * amp * 0.5
        + Math.sin(wx * 0.015 + layer) * amp * 0.25;
      ctx.lineTo(x, baseY - Math.max(0, h));
    }
    ctx.lineTo(c.x + W + 10, c.y + H + 10);
    ctx.closePath();
    ctx.fill();
  }

  // ── 4) Ruined architecture silhouettes (background structures)
  const structures = zone.bgStructures || _defaultStructures(zone);
  ctx.save();
  for (const s of structures) {
    const px = s.x - c.x * s.parallax;
    if (px < c.x - 200 || px > c.x + W + 200) continue;
    ctx.globalAlpha = s.alpha || 0.12;
    ctx.fillStyle = s.color || zone.accent + '30';
    if (s.type === 'pillar') {
      ctx.fillRect(px, s.y - c.y * s.parallax, s.w, s.h);
      // Capital
      ctx.fillRect(px - 6, s.y - c.y * s.parallax - 10, s.w + 12, 12);
    } else if (s.type === 'arch') {
      ctx.fillRect(px, s.y - c.y * s.parallax, 20, s.h);
      ctx.fillRect(px + s.w - 20, s.y - c.y * s.parallax, 20, s.h);
      ctx.beginPath();
      ctx.arc(px + s.w * 0.5, s.y - c.y * s.parallax, s.w * 0.5, Math.PI, 0);
      ctx.fill();
    } else if (s.type === 'tower') {
      ctx.fillRect(px, s.y - c.y * s.parallax, s.w, s.h);
      // Battlements
      for (let b = 0; b < 4; b++) {
        ctx.fillRect(px + b * (s.w / 4), s.y - c.y * s.parallax - 20, s.w / 6, 22);
      }
      // Window glow
      if (!lowPerf) {
        ctx.globalAlpha = 0.15 + 0.1 * Math.sin(t + s.x);
        ctx.fillStyle = zone.accent;
        ctx.shadowColor = zone.accent;
        ctx.shadowBlur = 15;
        ctx.fillRect(px + s.w * 0.3, s.y - c.y * s.parallax + s.h * 0.3, s.w * 0.15, s.h * 0.1);
        ctx.fillRect(px + s.w * 0.55, s.y - c.y * s.parallax + s.h * 0.3, s.w * 0.15, s.h * 0.1);
        ctx.shadowBlur = 0;
      }
    }
  }
  ctx.restore();

  // ── 5) Fog layers (parallax, undulating)
  const [fogH, fogS, fogL] = zone.fog;
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const px = (c.x * (0.05 + i * 0.04));
    const layerY = c.y + H * (0.3 + i * 0.18);
    ctx.globalAlpha = 0.04 + i * 0.018;
    ctx.fillStyle = `hsl(${fogH + i * 12}, ${fogS}%, ${fogL + i * 4}%)`;
    for (let j = 0; j < 7; j++) {
      const rx = (j * 500 + px + Math.sin(t * 0.3 + j + i) * 60) % (zone.W + 400) - 200;
      const ry = layerY + Math.sin(t * 0.2 + j * 2 + i) * 30;
      ctx.beginPath();
      ctx.ellipse(rx, ry, 300 + i * 50, 80 + i * 20 + Math.sin(t * 0.4 + j) * 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // ── 6) Catacombs — torch lights & embers
  if (zone.id === 'catacombs') {
    for (let i = 0; i < 12; i++) {
      const tx = i * 420 + 120 - c.x * 0.15;
      const ty = c.y + 60 + Math.sin(i * 3) * 40;
      if (tx < c.x - 200 || tx > c.x + W + 200) continue;
      ctx.save();
      const flicker = 0.12 + 0.08 * Math.sin(t * 5 + i * 2.7);
      ctx.globalAlpha = flicker;
      const tg = ctx.createRadialGradient(tx, ty, 0, tx, ty, 160);
      tg.addColorStop(0, 'rgba(255,120,30,0.9)');
      tg.addColorStop(0.3, 'rgba(255,80,10,0.4)');
      tg.addColorStop(1, 'rgba(255,50,0,0)');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.ellipse(tx, ty, 160, 200, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Skull decorations in background
    if (!lowPerf) {
      for (let i = 0; i < 6; i++) {
        const sx = i * 800 + 300 - c.x * 0.08;
        const sy = zone.GY - 60 - c.y * 0.03;
        if (sx < c.x - 30 || sx > c.x + W + 30) continue;
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#c8a070';
        ctx.beginPath();
        ctx.arc(sx, sy, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a0c00';
        ctx.fillRect(sx - 5, sy - 2, 4, 4);
        ctx.fillRect(sx + 2, sy - 2, 4, 4);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ── 7) Peaks — lightning flashes & rain
  if (zone.id === 'peaks') {
    // Distant lightning
    if (Math.random() < 0.002) {
      ctx.save();
      ctx.globalAlpha = 0.15 + Math.random() * 0.15;
      ctx.fillStyle = '#c0e8ff';
      ctx.fillRect(c.x, c.y, W, H);
      ctx.restore();
    }
    // Rain streaks
    if (!lowPerf) {
      ctx.save();
      ctx.strokeStyle = 'rgba(100,180,255,0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 60; i++) {
        const rx = c.x + ((i * 83 + t * 120) % W);
        const ry = c.y + ((i * 47 + t * 300) % H);
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 3, ry + 15);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── 8) Abyss — floating crystal formations
  if (zone.id === 'abyss' && !lowPerf) {
    for (let i = 0; i < 8; i++) {
      const cx_ = i * 650 + 200 - c.x * 0.06;
      const cy_ = zone.GY - 200 - i * 60 - c.y * 0.04 + Math.sin(t * 0.5 + i) * 15;
      if (cx_ < c.x - 40 || cx_ > c.x + W + 40) continue;
      const glow = 0.08 + 0.05 * Math.sin(t * 1.5 + i * 2);
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#9060ff';
      ctx.shadowColor = '#9060ff';
      ctx.shadowBlur = 20;
      // Crystal shape
      ctx.beginPath();
      ctx.moveTo(cx_, cy_ - 30);
      ctx.lineTo(cx_ + 8, cy_);
      ctx.lineTo(cx_, cy_ + 5);
      ctx.lineTo(cx_ - 8, cy_);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  // ── 9) God rays / light shafts
  if (!lowPerf) {
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const rx = (i * 1100 + 300) - c.x * 0.1;
      if (rx < c.x - 100 || rx > c.x + W + 100) continue;
      const swing = Math.sin(t * 0.2 + i * 1.5) * 40;
      ctx.globalAlpha = 0.02 + 0.015 * Math.sin(t * 0.4 + i * 3);
      ctx.fillStyle = zone.id === 'catacombs' ? 'rgba(255,150,50,0.5)' :
        zone.id === 'peaks' ? 'rgba(80,180,255,0.4)' :
          'rgba(160,120,255,0.4)';
      ctx.beginPath();
      ctx.moveTo(rx + swing - 30, c.y);
      ctx.lineTo(rx + swing + 30, c.y);
      ctx.lineTo(rx + swing + 120, c.y + H);
      ctx.lineTo(rx + swing - 120, c.y + H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

// ── Default background structures per zone
function _defaultStructures(zone) {
  const GY = zone.GY;
  const structs = [];
  if (zone.id === 'abyss') {
    // Ruined columns of an ancient void temple
    for (let i = 0; i < 10; i++) {
      structs.push({
        type: 'pillar', x: i * 520 + 100, y: GY - 200 - Math.random() * 150,
        w: 22 + Math.random() * 12, h: 200 + Math.random() * 100,
        parallax: 0.1, alpha: 0.06 + Math.random() * 0.04, color: '#5030a0'
      });
    }
    structs.push({ type: 'arch', x: 1600, y: GY - 350, w: 200, h: 280, parallax: 0.07, alpha: 0.05, color: '#4020a0' });
    structs.push({ type: 'arch', x: 3400, y: GY - 380, w: 220, h: 300, parallax: 0.06, alpha: 0.04, color: '#3818a0' });
    structs.push({ type: 'tower', x: 4200, y: GY - 500, w: 80, h: 420, parallax: 0.05, alpha: 0.05, color: '#3510a0' });
  } else if (zone.id === 'catacombs') {
    for (let i = 0; i < 8; i++) {
      structs.push({
        type: 'pillar', x: i * 580 + 150, y: GY - 180 - Math.random() * 100,
        w: 18 + Math.random() * 10, h: 180 + Math.random() * 80,
        parallax: 0.08, alpha: 0.07 + Math.random() * 0.04, color: '#6a4020'
      });
    }
    structs.push({ type: 'arch', x: 1200, y: GY - 280, w: 180, h: 220, parallax: 0.06, alpha: 0.06, color: '#5a3018' });
    structs.push({ type: 'arch', x: 3000, y: GY - 300, w: 200, h: 240, parallax: 0.05, alpha: 0.05, color: '#503010' });
  } else {
    // Storm peaks — distant fortresses
    structs.push({ type: 'tower', x: 800, y: GY - 600, w: 90, h: 520, parallax: 0.04, alpha: 0.06, color: '#104080' });
    structs.push({ type: 'tower', x: 2800, y: GY - 550, w: 100, h: 480, parallax: 0.05, alpha: 0.05, color: '#0c3060' });
    structs.push({ type: 'tower', x: 4200, y: GY - 650, w: 110, h: 570, parallax: 0.03, alpha: 0.04, color: '#082848' });
    for (let i = 0; i < 6; i++) {
      structs.push({
        type: 'pillar', x: i * 850 + 300, y: GY - 250 - Math.random() * 180,
        w: 24, h: 250 + Math.random() * 120,
        parallax: 0.07, alpha: 0.05, color: '#0a2858'
      });
    }
  }
  // Cache it
  zone.bgStructures = structs;
  return structs;
}

// ── Level Drawing (platforms, spikes, details) ────────────
function drawLevel(zone, plats, spikes) {
  const accent = zone.accent;
  const t = Date.now() * 0.001;

  plats.forEach(p => {
    if (p.t === 'G') {
      const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
      g.addColorStop(0, zone.ground[0]);
      g.addColorStop(1, zone.ground[1]);
      ctx.fillStyle = g;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // Top accent line with glow
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(p.x, p.y, p.w, 3);
      ctx.globalAlpha = 1;
      // Subtle vertical cracks/lines
      ctx.strokeStyle = 'rgba(255,255,255,.03)';
      ctx.lineWidth = 1;
      for (let lx = p.x; lx < p.x + p.w; lx += 64) {
        ctx.beginPath(); ctx.moveTo(lx, p.y); ctx.lineTo(lx, p.y + p.h); ctx.stroke();
      }
      // Grass/moss tufts on ground
      if (!lowPerf) {
        ctx.globalAlpha = 0.3;
        const grassColor = zone.id === 'catacombs' ? '#4a3020' : zone.id === 'peaks' ? '#1a3050' : '#2a1a50';
        ctx.fillStyle = grassColor;
        for (let gx = p.x + 8; gx < p.x + p.w - 8; gx += 24 + Math.sin(gx * 0.1) * 8) {
          const gh = 4 + Math.sin(gx * 0.3 + t * 0.5) * 2;
          ctx.fillRect(gx, p.y - gh, 3, gh);
          ctx.fillRect(gx + 5, p.y - gh * 0.7, 2, gh * 0.7);
        }
        ctx.globalAlpha = 1;
      }
    } else if (p.t === 'W') {
      const g = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y);
      g.addColorStop(0, zone.ground[1]);
      g.addColorStop(1, zone.ground[0]);
      ctx.fillStyle = g;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // Wall vines/cracks
      if (!lowPerf && p.h > 100) {
        ctx.strokeStyle = accent + '18';
        ctx.lineWidth = 1;
        for (let vy = p.y + 30; vy < p.y + p.h; vy += 60) {
          ctx.beginPath();
          ctx.moveTo(p.x + p.w * 0.5, vy);
          ctx.quadraticCurveTo(p.x + p.w * 0.5 + Math.sin(vy * 0.05) * 6, vy + 30,
            p.x + p.w * 0.5, vy + 60);
          ctx.stroke();
        }
      }
    } else {
      // Platform
      const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
      g.addColorStop(0, zone.plat[0]);
      g.addColorStop(1, zone.plat[1]);
      ctx.fillStyle = g;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // Glowing top edge
      ctx.fillStyle = accent;
      if (!lowPerf) { ctx.shadowColor = accent; ctx.shadowBlur = 14; }
      ctx.fillRect(p.x, p.y, p.w, 3);
      ctx.shadowBlur = 0;
      // Under-shadow
      ctx.fillStyle = 'rgba(150,120,220,.06)';
      ctx.fillRect(p.x, p.y + p.h, p.w, 8);
      // Edge caps
      ctx.fillStyle = accent + '30';
      ctx.fillRect(p.x - 2, p.y, 4, p.h);
      ctx.fillRect(p.x + p.w - 2, p.y, 4, p.h);
    }
  });

  // Spikes with enhanced visuals
  spikes.forEach(s => {
    const cnt = Math.max(1, Math.floor(s.w / 18)), sw = s.w / cnt;
    // Base glow
    if (!lowPerf) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      const sg = ctx.createRadialGradient(s.x + s.w * 0.5, s.y + s.h, 0, s.x + s.w * 0.5, s.y + s.h, s.w * 0.6);
      sg.addColorStop(0, 'rgba(192,57,43,0.5)');
      sg.addColorStop(1, 'rgba(192,57,43,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(s.x - s.w * 0.3, s.y - s.w * 0.3, s.w * 1.6, s.w * 0.8);
      ctx.restore();
    }
    ctx.shadowColor = '#c0392b';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#c0392b';
    for (let i = 0; i < cnt; i++) {
      ctx.beginPath();
      ctx.moveTo(s.x + i * sw, s.y + s.h);
      ctx.lineTo(s.x + i * sw + sw * .5, s.y);
      ctx.lineTo(s.x + i * sw + sw, s.y + s.h);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // Dripping effect
    if (!lowPerf) {
      ctx.fillStyle = 'rgba(192,57,43,0.4)';
      for (let i = 0; i < 3; i++) {
        const dx = s.x + (i + 0.5) * (s.w / 3);
        const dripLen = 4 + Math.sin(t * 2 + i + s.x) * 3;
        ctx.fillRect(dx, s.y + s.h, 2, dripLen);
      }
    }
  });

  // ── Ground fog (volumetric feel)
  if (!lowPerf) {
    ctx.save();
    const fogAlpha = zone.id === 'catacombs' ? 0.08 : 0.05;
    ctx.globalAlpha = fogAlpha;
    const fogColor = zone.id === 'catacombs' ? 'rgba(255,120,40,0.5)'
      : zone.id === 'peaks' ? 'rgba(80,160,255,0.4)'
        : 'rgba(140,100,220,0.5)';
    for (let fx = cam.x - 100; fx < cam.x + canvas.width + 100; fx += 180) {
      const fWobble = Math.sin(t * 0.5 + fx * 0.005) * 20;
      const fg = ctx.createRadialGradient(fx, zone.GY + fWobble, 0, fx, zone.GY + fWobble, 120);
      fg.addColorStop(0, fogColor);
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.ellipse(fx, zone.GY + fWobble, 140, 50 + Math.sin(t * 0.3 + fx * 0.01) * 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ── Enhanced Arena Gate ───────────────────────────────────
function drawArenaGate(gx, GY, accent) {
  const t = Date.now() * 0.001;
  ctx.save();

  // Pillar glow
  if (!lowPerf) {
    ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 2);
    const gateGlow = ctx.createRadialGradient(gx, GY - 125, 0, gx, GY - 125, 120);
    gateGlow.addColorStop(0, accent + '80');
    gateGlow.addColorStop(1, accent + '00');
    ctx.fillStyle = gateGlow;
    ctx.fillRect(gx - 120, GY - 280, 240, 320);
    ctx.globalAlpha = 1;
  }

  // Stone pillars
  ctx.fillStyle = '#1a1228';
  ctx.fillRect(gx - 30, GY - 260, 28, 260);
  ctx.fillRect(gx + 2, GY - 260, 28, 260);

  // Accent lines
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 18;
  ctx.strokeRect(gx - 28, GY - 250, 26, 250);
  ctx.strokeRect(gx + 4, GY - 250, 26, 250);

  // Arch
  ctx.beginPath();
  ctx.arc(gx, GY - 250, 32, Math.PI, 0);
  ctx.stroke();

  // Rune symbols on pillars
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.4 + 0.2 * Math.sin(t * 1.5);
  for (let ry = GY - 220; ry < GY - 30; ry += 50) {
    ctx.fillRect(gx - 22, ry, 6, 3);
    ctx.fillRect(gx - 18, ry + 8, 6, 3);
    ctx.fillRect(gx + 14, ry, 6, 3);
    ctx.fillRect(gx + 18, ry + 8, 6, 3);
  }

  // Eye at the top of the arch
  ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 2);
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(gx, GY - 270, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Main Game Loop ────────────────────────────────────────
function loop(ts) {
  if (state !== GameState.PLAYING) return;
  trackFps(ts);
  const dt = Math.min((ts - lastT) / 16.667, 3);
  lastT = ts;
  const zd = curZone;

  // Пауза
  if (input.pressed('Escape')) {
    state = GameState.PAUSED;
    document.getElementById('pause-screen').classList.remove('hidden');
    input.flush(); return;
  }

  // Диалог
  if (dialogActive) {
    if (input.pressed('KeyZ') || input.pressed('Enter')) { advanceDialog(); input.flush(); }
    return;
  }

  // ── Триггер босса:
  if (curBoss && !curBoss.appeared && player.cx > curGateX + 80) {
    curBoss.appeared = true;
    bossActive = true;
    document.getElementById('boss-bar').style.display = 'flex';
    if (curBoss._bossName) updateBoss(curBoss.hp, curBoss.maxHp, curBoss._bossName);
  }
  if (bossActive && !_arenaLocked && player.x > curGateX + player.w + 30) {
    lockArena(curGateX);
  }

  // ── Обновление игрока
  player.update(dt, curPlats, zd.GY);

  // ── Parry tick
  if (parryCD > 0) parryCD--;
  if (parryWindow > 0) parryWindow--;
  updateParryHUD(parryCD, parryWindow, PARRY_CD);

  // ── Костры
  let nearBonfire = false;
  curBonfires.forEach((bf, i) => {
    bf.update(dt);
    const zone = { x: bf.x - 10, y: bf.y - 20, w: bf.w + 20, h: bf.h + 20 };
    if (ov(player, zone) && player.alive) {
      nearBonfire = true;
      showBonfirePopup();
      if (!bf.lit) {
        bf.light();
        player.lives = player.maxLives; updateHearts(player.lives, player.maxLives);
        saveData.checkpoint = { zone: zd.id, bonfireIdx: i, x: bf.x + bf.w * .5 - 18, y: bf.y - 50 };
        saveGame();
        floatTxt(bf.x + 15, bf.y - 40, '🔥 КОСТЁР', '#ff9944');
      }
      if (input.pressed('KeyE') || input.pressed('KeyQ')) {
        state = GameState.SHOP;
        hideBonfirePopup(); openShopAtBonfire(); input.flush();
      }
    }
  });
  if (!nearBonfire) hideBonfirePopup();

  // ── Враги
  curEnemies.forEach(e => e.update(dt, curPlats, player, zd.GY));

  // ── Босс
  if (curBoss) curBoss.update(dt, curPlats, player, zd.GY);

  // ── Drops
  drops.forEach(d => d.update(dt, curPlats));
  drops = drops.filter(d => d.alive);
  for (const d of drops) {
    if (ov(player, { x: d.cx - 8, y: d.cy - 8, w: 16, h: 16 })) {
      const v = d.collect();
      floatTxt(d.cx, d.cy - 10, '+' + v, '#ffd700');
      updateSoulsHUD(saveData.souls);
    }
  }
  drops = drops.filter(d => d.alive);

  // ── Частицы
  pts.update(dt);

  // ── Ambient particles
  updateAmbientParticles(zd, dt);

  // ── Удар мечом
  if (player.attacking) {
    const hb = player.hitbox;
    if (hb) {
      curEnemies.forEach(e => {
        if (!e.alive || !ov(hb, e)) return;
        const fromBehind = Math.sign(player.facing) !== e.facing;
        const hit = (e instanceof ShieldWraith)
          ? e.takeDmg(player.atkDmg, player.facing * 5, -4, fromBehind)
          : e.takeDmg(player.atkDmg, player.facing * 5, -4);
        if (hit) {
          player.gainMana(14);
          pts.emit(hb.x + hb.w * .5, hb.y + hb.h * .5, 8, { color: '#fff', speed: 4 });
        }
      });
      if (curBoss && curBoss.alive && ov(hb, curBoss)) {
        if (curBoss.takeDmg(player.atkDmg, player.facing * 3, -2)) player.gainMana(9);
      }
    }
  }

  // ── Магические снаряды
  for (const bolt of player.bolts) {
    if (!bolt.alive) continue;
    curEnemies.forEach(e => {
      if (!e.alive || !ov(bolt, e)) return;
      if (e instanceof ShieldWraith) {
        const fb = Math.sign(bolt.dx) !== e.facing;
        if (!fb) { bolt.alive = false; return; }
      }
      if (e.takeDmg(bolt.dmg || player.magicDmg, bolt.dx * .4, -3)) {
        player.gainMana(10);
        floatTxt(e.cx, e.y - 10, '-' + bolt.dmg, '#4fc3f7');
      }
      bolt.alive = false;
      pts.emit(bolt.cx, bolt.cy, 12, { color: '#4fc3f7', speed: 4, grav: .05 });
    });
    if (curBoss && curBoss.alive && bolt.alive && ov(bolt, curBoss)) {
      const dmg = bolt.dmg || player.magicDmg;
      if (curBoss.takeDmg(dmg, bolt.dx * .2, -1)) {
        player.gainMana(6); floatTxt(curBoss.cx, curBoss.y - 20, '-' + dmg, '#4fc3f7');
      }
      bolt.alive = false;
      pts.emit(bolt.cx, bolt.cy, 14, { color: '#4fc3f7', speed: 5, grav: .06 });
    }
  }

  // ── Ульта — AoE урон
  if (player.ultActive > 0 && player.ultActive % 6 === 0) {
    const ultR = 85;
    curEnemies.forEach(e => {
      if (!e.alive) return;
      if (Math.hypot(e.cx - player.cx, e.cy - player.cy) < ultR) {
        e.takeDmg(player.atkDmg + 1, Math.sign(e.cx - player.cx) * 8, -5);
        player.gainMana(4);
      }
    });
    if (curBoss && curBoss.alive) {
      if (Math.hypot(curBoss.cx - player.cx, curBoss.cy - player.cy) < ultR + 30) {
        curBoss.takeDmg(player.atkDmg + 1, Math.sign(curBoss.cx - player.cx) * 4, -2);
        player.gainMana(4);
      }
    }
  }

  // ── Шипы
  curSpikes.forEach(s => {
    if (ov(player, s) && player.inv <= 0) {
      const pushX = player.dx > .5 ? -9 : player.dx < -.5 ? 9 : (player.cx < s.x + s.w * .5 ? -9 : 9);
      player.takeDmg(1, pushX, -11);
      if (player.y + player.h > s.y) player.y = s.y - player.h - 2;
    }
  });

  // ── Обновление ульт-кнопки HUD
  const ultBtn = document.getElementById('btn-ult');
  if (ultBtn) {
    if (player.ultCD > 0) {
      ultBtn.style.background = 'rgba(30,0,30,.82)';
      ultBtn.textContent = Math.ceil(player.ultCD / 60) + 's';
    } else if (player.mana >= player.maxMana) {
      ultBtn.style.background = 'rgba(180,0,220,.6)';
      ultBtn.textContent = '☄';
    } else {
      ultBtn.style.background = 'rgba(60,0,60,.82)';
      ultBtn.textContent = '☄';
    }
  }

  updateSp(player.sp, player.maxSp);

  // ── Камера
  if (bossActive) {
    cam.followBoss(curGateX, zd.W, zd.H, player, dt);
  } else {
    cam.follow(player, zd.W, zd.H);
  }
  cam.update();

  // ── Рисование
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  cam.apply();

  // Background (epic parallax layers)
  drawBG(zd);

  // Level geometry
  drawLevel(zd, curPlats, curSpikes);

  // Ambient particles (between BG and entities)
  drawAmbientParticles();

  // Game objects
  curBonfires.forEach(b => b.draw());
  drops.forEach(d => d.draw());
  curEnemies.forEach(e => e.draw());
  if (curBoss) curBoss.draw();

  // Ворота арены
  drawArenaGate(curGateX, zd.GY, zd.accent);

  // Блок-стена когда арена заперта
  if (bossActive && arenaWalls.length > 0) {
    ctx.save();
    const gateGlow = 0.5 + 0.2 * Math.sin(Date.now() * 0.005);
    ctx.fillStyle = `rgba(220,50,50,${gateGlow})`;
    ctx.shadowColor = '#ff3333';
    ctx.shadowBlur = 25;
    ctx.fillRect(curGateX, zd.GY - 100, 20, 100);
    // Energy bars across
    ctx.strokeStyle = `rgba(255,100,100,${0.3 + 0.2 * Math.sin(Date.now() * 0.008)})`;
    ctx.lineWidth = 2;
    for (let ey = zd.GY - 90; ey < zd.GY; ey += 12) {
      ctx.beginPath();
      ctx.moveTo(curGateX, ey);
      ctx.lineTo(curGateX + 20, ey + Math.sin(Date.now() * 0.01 + ey) * 3);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  pts.draw();
  player.draw();

  // ── Vignette overlay (subtle darkening at edges)
  cam.reset();
  if (!lowPerf) {
    ctx.save();
    const vg = ctx.createRadialGradient(
      canvas.width * 0.5, canvas.height * 0.5, canvas.height * 0.35,
      canvas.width * 0.5, canvas.height * 0.5, canvas.height * 0.85
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // ── Проверка смерти / победы
  if (!player.alive && player.deathTimer > 90) { respawnOrGameOver(); return; }
  if (curBoss && !curBoss.alive && curBoss.deathTimer > 130) { zoneClear(); return; }

  input.flush();
  requestAnimationFrame(loop);
}