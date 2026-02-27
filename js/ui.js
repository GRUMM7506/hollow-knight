// ============================================================
//  ui.js — Интерфейс: магазин, диалоги, карта, настройки
// ============================================================

'use strict';

// ── Управление кастомными биндами ─────────────────────────
const DEFAULT_BINDS = {
  left: 'ArrowLeft', right: 'ArrowRight', jump: 'Space',
  dash: 'ShiftLeft', attack: 'KeyZ', magic: 'KeyC',
  heal: 'KeyF', ult: 'KeyR', slam: 'KeyV'
};

const BIND_LABELS = {
  left: 'Влево', right: 'Вправо', jump: 'Прыжок',
  dash: 'Рывок', attack: 'Удар', magic: 'Магия',
  heal: 'Лечение', ult: 'Ульта', slam: 'Удар вниз'
};

let keyBinds = { ...DEFAULT_BINDS };
try {
  const saved = localStorage.getItem('hollow_binds');
  if (saved) keyBinds = Object.assign({}, DEFAULT_BINDS, JSON.parse(saved));
} catch (e) { console.warn("Не удалось загрузить бинды"); }

function saveBinds() {
  try { localStorage.setItem('hollow_binds', JSON.stringify(keyBinds)); } catch (e) {}
}

// ── Позиции мобильных кнопок ──────────────────────────────
const DEFAULT_BTN_POS = {
  left:   { bottom:20,  left:12 },
  right:  { bottom:20,  left:84 },
  jump:   { bottom:80,  right:12 },
  attack: { bottom:148, right:82 },
  dash:   { bottom:80,  right:82 },
  magic:  { bottom:148, right:12 },
  heal:   { bottom:8,   right:82 },
  ult:    { bottom:8,   right:12 },
  slam:   { bottom:20,  left:160 }
};
let btnPos = {};
try {
  const s = localStorage.getItem('hollow_btnpos');
  if (s) btnPos = JSON.parse(s);
} catch(e) {}

function getBtnPos(id) { return btnPos[id] || DEFAULT_BTN_POS[id] || null; }
function saveBtnPos()  { try { localStorage.setItem('hollow_btnpos', JSON.stringify(btnPos)); } catch(e) {} }

function applyBtnPositions() {
  const ids = ['left','right','jump','attack','dash','magic','heal','ult','slam'];
  ids.forEach(id => {
    const pos = getBtnPos(id);
    const el  = document.getElementById('btn-' + id);
    if (!el || !pos) return;
    el.style.position = 'fixed';
    el.style.bottom   = pos.bottom !== undefined ? pos.bottom + 'px' : '';
    el.style.top      = pos.top    !== undefined ? pos.top    + 'px' : '';
    el.style.left     = pos.left   !== undefined ? pos.left   + 'px' : '';
    el.style.right    = pos.right  !== undefined ? pos.right  + 'px' : '';
    el.style.margin   = '0';
  });
}

// ── Control Editor ────────────────────────────────────────
let listeningFor = null;

function openCtrlEditor() {
  document.getElementById('ctrl-editor').classList.remove('hidden');
  buildCtrlEditor();
}

function buildCtrlEditor() {
  // --- Биндинги клавиш ---
  const el = document.getElementById('ctrl-bindings');
  if (!el) return;
  el.innerHTML = '<div class="ctrl-section">КЛАВИШИ</div>';
  Object.keys(DEFAULT_BINDS).forEach(action => {
    const row = document.createElement('div'); row.className = 'ctrl-row';
    const lbl = document.createElement('span'); lbl.className = 'ctrl-label';
    lbl.textContent = BIND_LABELS[action] || action;
    const btn = document.createElement('button'); btn.className = 'ctrl-key-btn';
    btn.id = 'bind-' + action;
    btn.textContent = _keyLabel(keyBinds[action]);
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      listeningFor = action;
      document.querySelectorAll('.ctrl-key-btn').forEach(b => b.classList.remove('listening'));
      btn.classList.add('listening'); btn.textContent = '...';
    });
    row.appendChild(lbl); row.appendChild(btn); el.appendChild(row);
  });

  // --- Позиции кнопок ---
  const posEl = document.getElementById('btn-positions');
  if (!posEl) return;
  posEl.innerHTML = '';
  const ids = ['left','right','jump','attack','dash','magic','heal','ult','slam'];
  const posLabels = { left:'◀', right:'▶', jump:'↑', attack:'⚔', dash:'💨', magic:'✨', heal:'💚', ult:'☄', slam:'⬇⚔' };
  ids.forEach(id => {
    const pos = getBtnPos(id) || {};
    const row = document.createElement('div'); row.className = 'btn-pos-row';
    const lbl = document.createElement('span'); lbl.className = 'btn-pos-label';
    lbl.textContent = posLabels[id] + ' ' + id;
    const bottomIn = document.createElement('input'); bottomIn.className = 'btn-pos-input';
    bottomIn.type = 'number'; bottomIn.placeholder = '↕ снизу';
    bottomIn.value = pos.bottom !== undefined ? pos.bottom : (pos.top !== undefined ? pos.top : 20);
    const xIn = document.createElement('input'); xIn.className = 'btn-pos-input';
    xIn.type = 'number'; xIn.placeholder = '↔ X';
    xIn.value = pos.left !== undefined ? pos.left : (pos.right !== undefined ? -pos.right : 0);
    [bottomIn, xIn].forEach(inp => inp.addEventListener('input', () => {
      const b = parseInt(bottomIn.value) || 0;
      const l = parseInt(xIn.value) || 0;
      if (!btnPos[id]) btnPos[id] = {};
      btnPos[id] = l >= 0 ? { bottom:b, left:l } : { bottom:b, right:-l };
      applyBtnPositions();
    }));
    row.appendChild(lbl); row.appendChild(bottomIn); row.appendChild(xIn);
    posEl.appendChild(row);
  });
}

function _keyLabel(code) {
  if (!code) return '-';
  return code.replace('Key','').replace('Arrow','').replace('ShiftLeft','Shift').replace('ShiftRight','Shift').replace('Space','Пробел');
}

// Слушаем нажатие клавиши для ребиндинга
window.addEventListener('keydown', e => {
  if (listeningFor) {
    keyBinds[listeningFor] = e.code;
    saveBinds();
    const btn = document.getElementById('bind-' + listeningFor);
    if (btn) { btn.classList.remove('listening'); btn.textContent = _keyLabel(e.code); }
    listeningFor = null;
    e.preventDefault();
  }
}, true);

document.getElementById('ctrl-editor-close').addEventListener('click', () => {
  saveBtnPos(); saveBinds();
  document.getElementById('ctrl-editor').classList.add('hidden');
});

// ── Bonfire Popup ─────────────────────────────────────────
// Фикс: показываем/скрываем popup и синхронно управляем pointer-events на controls
function showBonfirePopup() {
  const popup    = document.getElementById('bonfire-popup');
  const controls = document.getElementById('controls');
  popup.style.display = 'block';
  // Блокируем кнопки управления пока popup видим
  controls.classList.add('popup-visible');
}
function hideBonfirePopup() {
  const popup    = document.getElementById('bonfire-popup');
  const controls = document.getElementById('controls');
  popup.style.display = 'none';
  controls.classList.remove('popup-visible');
}

// Клик по кнопке магазина у костра
document.getElementById('bp-shop-btn').addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation();
  // Событие обрабатывается в main.js через колбэк
  if (typeof onBonfireShopClick === 'function') onBonfireShopClick();
}, { passive: false });

// ── Dialog System ─────────────────────────────────────────
let dialogActive = false, dialogLines = [], dialogIdx = 0;
let dialogCB = null, dialogNPC = '';

function showDialog(npc, lines, cb) {
  dialogActive = true; dialogLines = lines; dialogIdx = 0; dialogCB = cb; dialogNPC = npc;
  document.getElementById('dialog-box').style.display = 'block';
  document.getElementById('dialog-npc').textContent  = npc;
  document.getElementById('dialog-text').textContent = lines[0];
}
function advanceDialog() {
  if (!dialogActive) return;
  dialogIdx++;
  if (dialogIdx >= dialogLines.length) { closeDialog(); return; }
  document.getElementById('dialog-text').textContent = dialogLines[dialogIdx];
}
function closeDialog() {
  dialogActive = false;
  document.getElementById('dialog-box').style.display = 'none';
  if (dialogCB) { const cb = dialogCB; dialogCB = null; cb(); }
}
document.getElementById('dialog-box').addEventListener('pointerdown', e => {
  e.preventDefault(); if (dialogActive) advanceDialog();
}, { passive: false });

// ── Shop ──────────────────────────────────────────────────
let shopReturnToGame = false;

function openShop() {
  const shopEl = document.getElementById('shop-screen');
  shopEl.classList.remove('hidden');
  document.getElementById('shop-souls-val').textContent = saveData.souls;
  const listEl = document.getElementById('shop-list'); listEl.innerHTML = '';
  UPGRADES.forEach(upg => {
    const lvl   = saveData.upgrades[upg.id] || 0;
    const maxed = lvl >= upg.max;
    const cost  = upg.cost[lvl] || '--';
    const div = document.createElement('div');
    div.className = 'shop-item' + (maxed ? ' maxed' : '');
    div.innerHTML = `<h3>${upg.icon} ${upg.name}</h3>
      <div class="desc">${upg.desc}</div>
      <div class="cost">${maxed ? '✓ КУПЛЕНО' : '✦ ' + cost + ' душ'}</div>
      <div class="lvl">Уровень: ${lvl}/${upg.max}</div>`;
    if (!maxed) div.addEventListener('click', () => buyUpgrade(upg.id));
    listEl.appendChild(div);
  });
}

function buyUpgrade(id) {
  const upg = UPGRADES.find(u => u.id === id);
  if (!upg) return;
  const lvl  = saveData.upgrades[id] || 0;
  if (lvl >= upg.max) return;
  const cost = upg.cost[lvl];
  if (saveData.souls < cost) { floatTxtGlobal('Недостаточно душ!', '#ff4444'); return; }
  saveData.souls -= cost; saveData.upgrades[id] = lvl + 1;
  updateSoulsHUD(saveData.souls); saveGame();
  openShop(); // обновляем список
}

function openShopAtBonfire() {
  shopReturnToGame = true;
  document.getElementById('hud').style.display = '';
  openShop();
}

document.getElementById('shop-close').addEventListener('click', () => {
  document.getElementById('shop-screen').classList.add('hidden');
  if (shopReturnToGame) {
    shopReturnToGame = false;
    if (typeof resumeGame === 'function') resumeGame();
  } else {
    openWorldMap();
  }
});

// ── World Map ─────────────────────────────────────────────
let mapCanvas, mapCtx;

function openWorldMap() {
  document.getElementById('shop-screen').classList.add('hidden');
  const screen = document.getElementById('world-map-screen');
  screen.classList.remove('hidden');
  screen.innerHTML = '';

  mapCanvas = document.createElement('canvas');
  mapCanvas.width  = innerWidth; mapCanvas.height = innerHeight;
  mapCanvas.style.width = '100%'; mapCanvas.style.height = '100%';
  screen.appendChild(mapCanvas);
  mapCtx = mapCanvas.getContext('2d');
  drawWorldMap();
  mapCanvas.addEventListener('click', onMapClick);

  // Кнопка Лавки
  const shopBtn = document.createElement('button');
  shopBtn.textContent = '⚗ Лавка Душ'; shopBtn.className = 'menu-btn';
  shopBtn.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);color:#ffd700;border-color:#ffd700;z-index:110;';
  shopBtn.addEventListener('click', () => { screen.classList.add('hidden'); openShop(); });
  screen.appendChild(shopBtn);

  // Отображение душ
  const soulsDiv = document.createElement('div');
  soulsDiv.style.cssText = 'position:fixed;top:20px;right:24px;color:#ffd700;font-family:monospace;font-size:14px;letter-spacing:2px;z-index:110;';
  soulsDiv.textContent = '✦ ' + saveData.souls + ' душ';
  screen.appendChild(soulsDiv);
}

function drawWorldMap() {
  const c = mapCtx, W = mapCanvas.width, H = mapCanvas.height;
  c.fillStyle = '#060810'; c.fillRect(0, 0, W, H);
  // Звёзды на фоне
  for (let i = 0; i < 200; i++) {
    const wx = (i*557)%W, wy = (i*311)%H;
    c.globalAlpha = .2 + .3 * Math.sin(Date.now()*.001 + i);
    c.fillStyle = '#c8b8ff'; c.fillRect(wx, wy, 1.5, 1.5);
  }
  c.globalAlpha = 1;
  // Заголовок
  c.fillStyle = 'rgba(255,255,255,.06)';
  c.font = `bold ${Math.min(80, W*.1)}px Georgia`;
  c.textAlign = 'center'; c.fillText('WORLD MAP', W*.5, H*.15);
  c.font = `${Math.min(18, W*.022)}px monospace`;
  c.fillStyle = 'rgba(255,255,255,.3)';
  c.fillText('— CHRONICLES OF THE ABYSS —', W*.5, H*.22);
  // Линии между зонами
  for (let i = 0; i < zoneNodes.length - 1; i++) {
    const a = zoneNodes[i], b = zoneNodes[i+1];
    const unlockB = saveData.zonesCleared.includes(a.id) || a.id === 'abyss';
    c.strokeStyle = unlockB ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.1)';
    c.lineWidth = 3; c.setLineDash([10, 8]);
    c.beginPath(); c.moveTo(a.x*W, a.y*H); c.lineTo(b.x*W, b.y*H); c.stroke();
    c.setLineDash([]);
  }
  // Узлы зон
  zoneNodes.forEach((node, idx) => {
    const nx = node.x*W, ny = node.y*H;
    const cleared  = saveData.zonesCleared.includes(node.id);
    const prevId   = zoneNodes[idx-1] ? zoneNodes[idx-1].id : '';
    const unlocked = node.id === 'abyss' || saveData.zonesCleared.includes(prevId);
    const r = Math.min(50, W*.055);
    if (unlocked) { c.shadowColor = node.color; c.shadowBlur = 30; }
    c.beginPath(); c.arc(nx, ny, r, 0, Math.PI*2);
    c.fillStyle   = cleared ? node.color+'44' : unlocked ? node.color+'22' : 'rgba(50,50,50,.5)';
    c.fill();
    c.strokeStyle = unlocked ? node.color : '#444'; c.lineWidth = 3; c.stroke(); c.shadowBlur = 0;
    // Иконка
    c.textAlign = 'center'; c.font = `bold ${r*.7}px monospace`;
    c.fillStyle = cleared ? '#a0ffa0' : unlocked ? node.color : '#555';
    c.fillText(cleared ? '✓' : unlocked ? (idx+1)+'' : '🔒', nx, ny + r*.28);
    // Подписи
    c.font = `bold ${Math.min(15, W*.018)}px monospace`;
    c.fillStyle = cleared ? '#a0ffa0' : unlocked ? '#fff' : '#666';
    c.fillText(node.name, nx, ny + r + 20);
    c.font = `${Math.min(11, W*.013)}px monospace`;
    c.fillStyle = unlocked ? node.color + 'aa' : '#555';
    c.fillText(node.sub, nx, ny + r + 36);
    c.font = `${Math.min(10, W*.012)}px monospace`;
    c.fillStyle = 'rgba(255,255,255,.4)';
    c.fillText(node.boss, nx, ny + r + 52);
  });
}

function onMapClick(e) {
  if (!mapCanvas) return;
  const W = mapCanvas.width, H = mapCanvas.height;
  const r = Math.min(50, W*.055);
  zoneNodes.forEach((node, idx) => {
    const nx = node.x*W, ny = node.y*H;
    const dx = e.clientX - nx, dy = e.clientY - ny;
    if (Math.hypot(dx, dy) < r + 20) {
      const prevId   = zoneNodes[idx-1] ? zoneNodes[idx-1].id : '';
      const unlocked = node.id === 'abyss' || saveData.zonesCleared.includes(prevId);
      if (unlocked && typeof startZone === 'function') startZone(node.id);
    }
  });
}

// ── Zone Label (cinematic) ────────────────────────────────
function showZoneLabel(name, sub, cb) {
  const lbl = document.getElementById('zone-label');
  document.getElementById('zone-label-name').textContent = name;
  document.getElementById('zone-label-sub').textContent  = sub;
  lbl.style.display = 'block'; lbl.style.opacity = '1';
  setTimeout(() => {
    lbl.style.transition = 'opacity 1s'; lbl.style.opacity = '0';
    setTimeout(() => {
      lbl.style.display = 'none'; lbl.style.transition = '';
      if (cb) cb();
    }, 1000);
  }, 2200);
}

// ── Death / Zone Clear / Victory screens ─────────────────
function showDeathScreen() {
  document.getElementById('hud').style.display = 'none';
  document.getElementById('controls').style.display = 'none';
  const ov = document.getElementById('zone-clear');
  ov.style.color = '#c9a0dc';
  ov.innerHTML = `<div style="text-align:center;color:#c9a0dc;">
    <h1 style="font-family:Georgia,serif;font-size:clamp(28px,7vw,54px);letter-spacing:6px;text-shadow:0 0 30px #c9a0dc;">ВЫ ПОГИБЛИ</h1>
    <p style="font-size:12px;letter-spacing:4px;opacity:.6;margin:10px 0 20px;font-family:monospace;">Бездна поглотила вас</p>
    <button class="menu-btn" id="death-retry">↺ ПОПРОБОВАТЬ СНОВА</button>
    <button class="menu-btn" id="death-map" style="margin-top:10px;opacity:.7;">🗺 КАРТА МИРА</button>
  </div>`;
  ov.classList.remove('hidden');
  document.getElementById('death-retry').onclick = () => {
    ov.classList.add('hidden');
    document.getElementById('hud').style.display = 'flex';
    document.getElementById('controls').style.display = 'block';
    if (typeof loadZone === 'function') loadZone(window._curZoneId || 'abyss');
  };
  document.getElementById('death-map').onclick = () => {
    ov.classList.add('hidden'); openWorldMap();
  };
}

function showZoneClearScreen(zoneName, nextIdx) {
  document.getElementById('hud').style.display = 'none';
  document.getElementById('controls').style.display = 'none';
  document.getElementById('boss-bar').style.display = 'none';
  const ov = document.getElementById('zone-clear');
  ov.classList.remove('hidden');
  document.getElementById('zone-clear-name').textContent    = '— ' + zoneName + ' —';
  const bonusSouls = 50 + nextIdx * 25;
  saveData.souls += bonusSouls; saveGame(); updateSoulsHUD(saveData.souls);
  document.getElementById('zone-clear-reward').textContent  = '✦ Награда: +' + bonusSouls + ' душ · Открыта новая зона!';
  const btn = document.getElementById('zone-clear-btn');
  btn.textContent = nextIdx < ZONE_ORDER.length ? '→ КАРТА МИРА' : '✦ ФИНАЛ';
  btn.style.color = '#a0ffa0'; btn.style.borderColor = '#a0ffa0';
  btn.onclick = () => {
    ov.classList.add('hidden');
    if (nextIdx >= ZONE_ORDER.length) showFinalVictory();
    else openWorldMap();
  };
}

function showFinalVictory() {
  const ov = document.getElementById('zone-clear');
  ov.classList.remove('hidden');
  ov.innerHTML = `<div style="text-align:center;color:#ffd700;">
    <h1 style="font-family:Georgia,serif;font-size:clamp(28px,7vw,54px);letter-spacing:6px;text-shadow:0 0 40px #ffd700;">ПОБЕДА!</h1>
    <p style="font-size:12px;letter-spacing:4px;opacity:.7;margin:10px 0 6px;font-family:monospace;">ВСЕ ТРИ ЗОНЫ ПРОЙДЕНЫ</p>
    <p style="font-size:11px;opacity:.5;font-family:monospace;margin-bottom:20px;">Бездна, Катакомбы и Грозовые Вершины очищены от тьмы.</p>
    <div style="font-size:13px;color:#ffd700;margin-bottom:20px;font-family:monospace;">Собрано душ: ${saveData.souls}</div>
    <button class="menu-btn" id="vic-btn" style="color:#ffd700;border-color:#ffd700;">↺ ИГРАТЬ СНОВА</button>
  </div>`;
  document.getElementById('vic-btn').onclick = () => {
    saveData.zonesCleared = []; saveData.checkpoint = null; saveGame(); location.reload();
  };
}

// ── Pause Screen ──────────────────────────────────────────
document.getElementById('pause-resume').addEventListener('click', () => {
  document.getElementById('pause-screen').classList.add('hidden');
  if (typeof resumeGame === 'function') resumeGame();
});
document.getElementById('pause-map').addEventListener('click', () => {
  document.getElementById('pause-screen').classList.add('hidden');
  document.getElementById('hud').style.display = 'none';
  document.getElementById('controls').style.display = 'none';
  if (typeof pauseGame === 'function') pauseGame();
  openWorldMap();
});
document.getElementById('pause-ctrl').addEventListener('click', () => {
  document.getElementById('pause-screen').classList.add('hidden');
  openCtrlEditor();
});

// ── Main Menu ─────────────────────────────────────────────
document.getElementById('start-btn').addEventListener('click', () => {
  initAudio();
  document.getElementById('main-menu').classList.add('hidden');
  applyBtnPositions();
  openWorldMap();
});
document.getElementById('main-ctrl-btn').addEventListener('click', () => {
  openCtrlEditor();
});

// Глобальный escape для предотвращения прокрутки
window.addEventListener('keydown', e => {
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});