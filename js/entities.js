// ============================================================
//  entities.js — Игрок, враги, предметы, костёр, снаряды
// ============================================================

'use strict';

// ── Upgrades Config ───────────────────────────────────────
const UPGRADES = [
  { id: 'hp', name: 'Живучесть', desc: 'Максимальное HP +1', cost: [50, 60, 75], max: 3, icon: '❤' },
  { id: 'mana', name: 'Аркана', desc: 'Максимальная мана +20', cost: [55, 70, 90], max: 3, icon: '💙' },
  { id: 'atkPow', name: 'Острота клинка', desc: 'Урон от меча +1', cost: [80, 110], max: 2, icon: '⚔' },
  { id: 'magicPow', name: 'Мощь магии', desc: 'Урон от магии +1', cost: [75, 100], max: 2, icon: '✨' },
  { id: 'dashRange', name: 'Вихревой рывок', desc: 'Дальность рывка +30%', cost: [90], max: 1, icon: '💨' },
  { id: 'healCost', name: 'Благодать', desc: 'Лечение стоит 70 маны вместо 100', cost: [120], max: 1, icon: '🌿' },
];

// ── Object Pool для снарядов MagicBolt ────────────────────
// Избегаем постоянного new/GC при частой стрельбе
const boltPool = new ObjectPool(
  () => ({ x: 0, y: 0, w: 18, h: 18, dx: 0, dy: 0, life: 0, alive: false, trail: [], dmg: 1 }),
  (obj, x, y, dir, dmg) => {
    obj.x = x; obj.y = y; obj.w = 18; obj.h = 18;
    obj.dx = dir * 12; obj.dy = 0;
    obj.life = 130; obj.alive = true;
    obj.trail = []; obj.dmg = dmg || 1;
  },
  32
);

// ── MagicBolt ─────────────────────────────────────────────
class MagicBolt {
  constructor(x, y, dir, dmg) {
    // Используем пул — этот конструктор нужен для совместимости
    this.x = x; this.y = y; this.w = 18; this.h = 18;
    this.dx = dir * 12; this.dy = 0;
    this.life = 130; this.alive = true;
    this.trail = []; this.dmg = dmg || 1;
  }
  get cx() { return this.x + 9; }
  get cy() { return this.y + 9; }

  update(dt) {
    this.trail.push({ x: this.cx, y: this.cy });
    if (this.trail.length > 10) this.trail.shift();
    this.x += this.dx * dt; this.y += this.dy * dt;
    this.life -= dt;
    if (this.life <= 0 || this.x < 0 || this.x > 99999) this.alive = false;
  }

  draw() {
    // Шлейф
    for (let i = 0; i < this.trail.length; i++) {
      ctx.globalAlpha = (i / this.trail.length) * .45;
      ctx.fillStyle = '#4fc3f7';
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, 4 * (i / this.trail.length), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const rg = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, 11);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(.4, 'rgba(100,200,255,1)');
    rg.addColorStop(1, 'rgba(20,80,200,0)');
    ctx.fillStyle = rg;
    ctx.shadowColor = '#4fc3f7'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ── DropItem (душевые монеты) ─────────────────────────────
class DropItem {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.w = 14; this.h = 14;
    this.dy = -4; this.type = type; this.alive = true;
    this.life = 300; this.t = 0; this.grounded = false;
  }
  get cx() { return this.x + 7; }
  get cy() { return this.y + 7; }

  update(dt, plats) {
    this.t += dt;
    this.dy += .35 * dt; if (this.dy > 9) this.dy = 9;
    this.y += this.dy * dt;
    if (plats) {
      this.grounded = false;
      for (const p of plats) {
        if (this.x + this.w > p.x && this.x < p.x + p.w &&
          this.y + this.h > p.y && this.y + this.h < p.y + p.h + this.dy + 4 && this.dy >= 0) {
          this.y = p.y - this.h;
          this.dy = this.dy > 2 ? -this.dy * .25 : 0;
          this.grounded = true;
        }
      }
    }
    this.life -= dt; if (this.life <= 0) this.alive = false;
  }

  collect() {
    this.alive = false;
    const v = this.type === 'large' ? 20 : this.type === 'medium' ? 10 : 5;
    saveData.souls += v; updateSoulsHUD(saveData.souls);
    snd('collect'); return v;
  }

  draw() {
    const pulse = .7 + .3 * Math.sin(this.t * .08);
    const c = this.type === 'large' ? '#ffd700' : this.type === 'medium' ? '#ffaa00' : '#ffcc44';
    ctx.shadowColor = c; ctx.shadowBlur = 12 * pulse;
    ctx.fillStyle = c; ctx.globalAlpha = Math.min(1, this.life / 40);
    const r = this.type === 'large' ? 7 : this.type === 'medium' ? 5 : 4;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, r * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
}

// ── Bonfire (Точка сохранения) ────────────────────────────
class Bonfire {
  constructor(x, y) { this.x = x; this.y = y; this.w = 30; this.h = 40; this.lit = false; this.t = 0; this.embers = []; }
  light() { if (!this.lit) { this.lit = true; snd('bonfire'); } }
  update(dt) {
    this.t += dt;
    // Spawn embers when lit
    if (this.lit && Math.random() < 0.08 * dt) {
      this.embers.push({
        x: this.x + 10 + Math.random() * 10,
        y: this.y + 10,
        dx: (Math.random() - 0.5) * 0.8,
        dy: -(0.5 + Math.random() * 1.2),
        life: 40 + Math.random() * 60,
        size: 1 + Math.random() * 2
      });
    }
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.x += e.dx * dt; e.y += e.dy * dt;
      e.dx += (Math.random() - 0.5) * 0.05 * dt;
      e.life -= dt;
      if (e.life <= 0) this.embers.splice(i, 1);
    }
    if (this.embers.length > 30) this.embers.splice(0, this.embers.length - 30);
  }
  draw() {
    // Stone base
    ctx.fillStyle = '#3a3050';
    ctx.fillRect(this.x - 4, this.y + 28, 38, 14);
    ctx.fillStyle = '#4a3868';
    ctx.fillRect(this.x - 2, this.y + 26, 34, 4);
    // Wood logs
    ctx.fillStyle = '#6a3a18'; ctx.fillRect(this.x + 2, this.y + 16, 26, 14);
    ctx.fillStyle = '#5a2a10'; ctx.fillRect(this.x + 6, this.y + 20, 8, 10);
    ctx.fillStyle = '#7a4a28'; ctx.fillRect(this.x + 16, this.y + 18, 8, 12);

    if (this.lit) {
      const flicker = Math.sin(this.t * 0.2) * 3;
      // Large ambient light pool
      ctx.save();
      const bigR = 140 + Math.sin(this.t * 0.15) * 15;
      const rg2 = ctx.createRadialGradient(this.x + 15, this.y, 0, this.x + 15, this.y + 10, bigR);
      rg2.addColorStop(0, 'rgba(255,140,30,0.14)'); rg2.addColorStop(0.5, 'rgba(255,100,10,0.06)');
      rg2.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = rg2;
      ctx.beginPath(); ctx.ellipse(this.x + 15, this.y + 10, bigR * 1.3, bigR, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Fire layers (4 layers for richer flame)
      for (let i = 0; i < 4; i++) {
        const fw = 20 - i * 4, fh = 16 + i * 5 + flicker;
        const fc = [
          'rgba(255,80,0,.9)', 'rgba(255,140,0,.75)',
          'rgba(255,210,40,.6)', 'rgba(255,255,150,.4)'
        ][i];
        ctx.fillStyle = fc; ctx.shadowColor = fc; ctx.shadowBlur = 20 + i * 4;
        ctx.beginPath();
        ctx.moveTo(this.x + 15, this.y + 16 - fh);
        ctx.quadraticCurveTo(this.x + 15 + fw * 0.65, this.y + 16 - fh * 0.5, this.x + 15 + fw * 0.5, this.y + 16);
        ctx.quadraticCurveTo(this.x + 15, this.y + 22, this.x + 15 - fw * 0.5, this.y + 16);
        ctx.quadraticCurveTo(this.x + 15 - fw * 0.65, this.y + 16 - fh * 0.5, this.x + 15, this.y + 16 - fh);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Ground reflection
      const rg = ctx.createRadialGradient(this.x + 15, this.y + 42, 0, this.x + 15, this.y + 42, 60);
      rg.addColorStop(0, 'rgba(255,120,0,.18)'); rg.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(this.x - 45, this.y + 20, 120, 50);

      // Embers
      for (const e of this.embers) {
        const alpha = Math.min(1, e.life / 20);
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = e.life > 30 ? '#ffcc44' : '#ff8820';
        ctx.shadowColor = '#ff8820'; ctx.shadowBlur = 4;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * (e.life / 60), 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    } else {
      const dim = 0.15 + 0.08 * Math.sin(this.t * 0.05);
      ctx.fillStyle = `rgba(100,60,20,${dim})`; ctx.fillRect(this.x + 4, this.y + 8, 22, 16);
      // Smoke wisps from unlit bonfire
      ctx.globalAlpha = 0.05 + 0.03 * Math.sin(this.t * 0.1);
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.ellipse(this.x + 15, this.y - 5 - Math.sin(this.t * 0.08) * 4, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

// ══════════════════════════════════════════════════════════
//  PLAYER
// ══════════════════════════════════════════════════════════
class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.w = 36; this.h = 44;
    this.dx = 0; this.dy = 0; this.facing = 1; this.grounded = false; this.onWall = 0;
    this.speed = 4.8; this.jumpPower = -13.5;

    const up = saveData.upgrades;
    this.maxLives = 8 + up.hp; this.lives = 8 + up.hp;
    this.maxSp = 6; this.sp = 6; this.spRegen = 0;
    this.maxMana = 100 + up.mana * 20; this.mana = 0;

    this.inv = 0; this.jumpsLeft = 2; this.coyote = 0; this.jbuf = 0; this.wjLock = 0;
    this.canDash = true; this.dashCD = 0; this.dashTime = 0; this.dashDir = 1;
    this.attacking = false; this.atkTime = 0; this.atkCD = 0; this.atkDir = 1;
    this.magicCD = 0; this.bolts = []; this.healCD = 0;
    this.ultCD = 0; this.ultActive = 0;
    this.manaOnHit = 18; // increased mana per hit

    this.anim = 'idle'; this.af = 0; this.at = 0;
    this.ASPD = { idle: 8, run: 5, jump: 99, attack: 3 };
    this.imgs = []; this.alive = true; this.deathTimer = 0;

    this.dashMult = saveData.upgrades.dashRange ? 1.3 : 1;
    this.healCostMult = saveData.upgrades.healCost ? 50 : 80;
    this.atkDmg = 1 + saveData.upgrades.atkPow;
    this.magicDmg = 1 + saveData.upgrades.magicPow;
  }

  get cx() { return this.x + this.w * .5; }
  get cy() { return this.y + this.h * .5; }

  get hitbox() {
    if (!this.attacking) return null;
    const r = 46, rh = this.h * .7;
    if (this.atkDir === 2) return { x: this.x + this.w * .1, y: this.y - r, w: this.w * .8, h: r };
    if (this.atkDir === -2) return { x: this.x + this.w * .1, y: this.y + this.h, w: this.w * .8, h: r };
    if (this.atkDir === 1) return { x: this.x + this.w, y: this.y + 4, w: r, h: rh };
    if (this.atkDir === -1) return { x: this.x - r, y: this.y + 4, w: r, h: rh };
    return null;
  }

  gainMana(a) {
    this.mana = Math.min(this.maxMana, this.mana + a);
    updateMana(this.mana, this.maxMana); snd('mana');
  }

  takeDmg(a, kbX, kbY) {
    if (this.inv > 0 || !this.alive) return;
    this.lives -= a; this.inv = 85; this.dx = kbX; this.dy = kbY;
    cam.shake(10); snd('hit');
    pts.emit(this.cx, this.cy, 14, { color: '#e74c3c', speed: 4, up: 2 });
    updateHearts(this.lives, this.maxLives);
    if (this.lives <= 0) { this.alive = false; this.deathTimer = 0; snd('death'); }
  }

  update(dt, plats, GY) {
    if (!this.alive) { this.deathTimer += dt; return; }

    const wasG = this.grounded; this.grounded = false; this.onWall = 0;

    // Чтение инпута с кастомными биндами
    const L = input.is(keyBinds.left) || input.is('ArrowLeft');
    const R = input.is(keyBinds.right) || input.is('ArrowRight');
    const wJ = input.pressed(keyBinds.jump) || input.pressed('Space');
    const wD = input.pressed(keyBinds.dash) || input.pressed('ShiftLeft') || input.pressed('ShiftRight');
    const wA = input.pressed(keyBinds.attack) || input.pressed('KeyZ') || input.pressed('KeyX');
    const wM = input.pressed(keyBinds.magic) || input.pressed('KeyC');
    const wH = input.pressed(keyBinds.heal) || input.pressed('KeyF');
    const wU = input.pressed(keyBinds.ult) || input.pressed('KeyR');
    const wSlam = input.pressed(keyBinds.slam) || input.pressed('KeyV');
    const aU = input.is('ArrowUp'), aD = input.is('ArrowDown');

    // Буфер прыжка
    if (wJ) this.jbuf = 14;
    if (this.jbuf > 0) this.jbuf--;

    // Горизонталь
    if (this.wjLock <= 0) {
      if (L) { this.dx = -this.speed; this.facing = -1; }
      else if (R) { this.dx = this.speed; this.facing = 1; }
      else this.dx *= .75;
    } else { this.wjLock--; this.dx *= .94; }

    // Гравитация (dt-нормированная)
    if (this.dashTime <= 0) {
      this.dy += (this.dy < 0 ? .5 : .72) * dt;
      if (this.dy > 20) this.dy = 20;
    }

    // Прыжок / wall-jump
    if (this.jbuf > 0 && (this.coyote > 0 || this.jumpsLeft > 0)) {
      if (this.onWall !== 0 && !this.grounded) {
        this.dy = this.jumpPower * .88; this.dx = -this.onWall * this.speed * 2.4;
        this.wjLock = 18; snd('jump'); this.jbuf = 0;
        pts.emit(this.cx, this.cy, 8, { color: '#9f7fe8', spread: 1.2, speed: 3, up: 2 });
      } else {
        const dbl = this.jumpsLeft === 1 && !this.grounded;
        this.dy = this.jumpPower * (dbl ? .84 : 1);
        this.jumpsLeft = Math.max(0, this.jumpsLeft - 1);
        this.coyote = 0; this.jbuf = 0; snd('jump');
        if (dbl) pts.emit(this.cx, this.cy + this.h * .5, 10, { color: '#c9a0dc', spread: Math.PI * .9, speed: 3, up: 1.5, grav: .04 });
      }
    }
    if (wasG && !this.grounded) this.coyote = 9;
    if (this.coyote > 0) this.coyote--;

    // Рывок (dash-cancel атаки)
    if (this.dashCD > 0) this.dashCD--;
    if (wD && this.canDash && this.dashCD <= 0) {
      tryParry();
      this.dashTime = 11; this.dashDir = this.facing;
      this.canDash = false; this.dashCD = 42; this.dy = 0;
      this.attacking = false; // Dash cancels attack
      snd('dash');
      pts.emit(this.cx, this.cy, lowPerf ? 6 : 14, { color: '#7a5ab0', angle: this.dashDir > 0 ? Math.PI : 0, spread: .5, speed: 6, up: 0, grav: 0 });
    }
    if (this.dashTime > 0) {
      this.dashTime--; this.dx = this.dashDir * 10 * this.dashMult; this.dy = 0;
      this.imgs.push({ x: this.x, y: this.y, a: .8 });
      if (this.imgs.length > 5) this.imgs.shift();
    }

    // Атака
    if (this.atkCD > 0) this.atkCD--;
    const doSlam = wSlam && !this.grounded;
    if ((wA || doSlam) && this.atkCD <= 0 && this.sp >= 1) {
      this.attacking = true; this.atkTime = 15; this.atkCD = 20; this.sp--;
      if (doSlam) this.atkDir = -2;
      else if (aU) this.atkDir = 2;
      else if (aD && !this.grounded) this.atkDir = -2;
      else this.atkDir = this.facing;
      snd('attack');
      if (doSlam) this.dy = 14;
    }
    if (this.atkTime > 0) this.atkTime--; else this.attacking = false;

    // Регенерация стамины
    this.spRegen++;
    if (this.spRegen >= 40 && this.sp < this.maxSp) { this.sp++; this.spRegen = 0; }

    // Магия
    if (this.magicCD > 0) this.magicCD--;
    if (wM && this.magicCD <= 0 && this.mana >= 30) {
      this.mana -= 30; updateMana(this.mana, this.maxMana);
      this.bolts.push(new MagicBolt(this.cx - 9, this.cy - 9, this.facing, this.magicDmg));
      this.magicCD = 25; snd('magic');
      pts.emit(this.cx + this.facing * 20, this.cy, 6, { color: '#4fc3f7', speed: 3, up: 1, grav: 0, size: 3 });
    }

    // Лечение
    if (this.healCD > 0) this.healCD--;
    if (wH && this.healCD <= 0 && this.mana >= this.healCostMult && this.lives < this.maxLives) {
      // Enhanced heal — restores 3 HP
      this.mana -= this.healCostMult;
      this.lives = Math.min(this.maxLives, this.lives + 3);
      this.healCD = 90; snd('heal');
      pts.emit(this.cx, this.cy, 18, { color: '#a0ffa0', speed: 3, up: 3, grav: .02, size: 4 });
      updateHearts(this.lives, this.maxLives); updateMana(this.mana, this.maxMana);
      floatTxt(this.cx, this.y - 20, '✦ HEAL', '#a0ffa0');
    }

    // Пустотный взрыв (ульта)
    if (this.ultCD > 0) this.ultCD--;
    if (this.ultActive > 0) { this.ultActive--; this.inv = Math.max(this.inv, this.ultActive + 2); }
    if (wU && this.ultCD <= 0 && this.mana >= this.maxMana) {
      this.mana = 0; updateMana(this.mana, this.maxMana);
      this.ultActive = 40; this.ultCD = 360;
      cam.shake(20);
      pts.emit(this.cx, this.cy, lowPerf ? 20 : 50, { color: '#cc44ff', speed: 8, up: 2, size: 6, spread: Math.PI * 2, grav: .05 });
      pts.emit(this.cx, this.cy, lowPerf ? 10 : 25, { color: '#ffffff', speed: 5, up: 0, size: 4, spread: Math.PI * 2, grav: 0 });
      floatTxt(this.cx, this.y - 50, '☄ ПУСТОТНЫЙ ВЗРЫВ', '#cc44ff'); snd('magic');
    }

    // Обновление снарядов
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].update(dt);
      if (!this.bolts[i].alive) this.bolts.splice(i, 1);
    }

    // Физика: X
    this.x += this.dx * dt; this.x = Math.max(0, this.x);
    const allWalls = [...plats, ...arenaWalls];
    for (const p of allWalls) {
      if (ov(this, p)) { const s = res(this, p); if (s === 'L') this.onWall = 1; if (s === 'R') this.onWall = -1; }
    }

    // Физика: Y
    this.y += this.dy * dt;
    for (const p of allWalls) {
      if (ov(this, p)) {
        const s = res(this, p);
        if (s === 'T') { this.grounded = true; this.jumpsLeft = 2; this.canDash = true; this.coyote = 0; }
      }
    }

    if (this.y > GY + 200) this.takeDmg(this.lives, 0, 0);
    if (this.inv > 0) this.inv--;
    for (let i = this.imgs.length - 1; i >= 0; i--) {
      this.imgs[i].a -= .065; if (this.imgs[i].a <= 0) this.imgs.splice(i, 1);
    }
    this._anim();
  }

  _anim() {
    let n = 'idle';
    if (!this.grounded) n = 'jump';
    else if (Math.abs(this.dx) > .5) n = 'run';
    if (this.attacking) n = 'attack';
    if (n !== this.anim) { this.anim = n; this.af = 0; this.at = 0; }
    this.at++; if (this.at >= this.ASPD[this.anim]) { this.at = 0; this.af++; }
  }

  draw() {
    if (!this.alive && this.deathTimer < 60) ctx.globalAlpha = 1 - this.deathTimer / 60;

    // Dash Afterimages (Phantom Trails)
    for (let i = 0; i < this.imgs.length; i++) {
      const ai = this.imgs[i];
      ctx.globalAlpha = ai.a * 0.5 * (i / this.imgs.length);
      this._shape(ai.x, ai.y, true);
    }

    ctx.globalAlpha = (this.inv > 0 && Math.floor(this.inv / 5) % 2 === 0) ? .3 : 1;
    this._shape(this.x, this.y, false);
    ctx.globalAlpha = 1;

    // Визуализация атаки (Nail Swipe)
    if (this.attacking) {
      const hb = this.hitbox;
      if (hb) {
        const p2 = 1 - (this.atkTime / 15); // Прогресс анимации 0..1
        ctx.save();

        const swipeGlow = ctx.createRadialGradient(
          hb.x + hb.w * 0.5, hb.y + hb.h * 0.5, 0,
          hb.x + hb.w * 0.5, hb.y + hb.h * 0.5, hb.w * 0.7
        );
        swipeGlow.addColorStop(0, `rgba(255, 255, 255, ${0.8 - p2 * 0.8})`);
        swipeGlow.addColorStop(0.5, `rgba(200, 240, 255, ${0.4 - p2 * 0.4})`);
        swipeGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = swipeGlow;

        // Arc / Crescent shape for attack
        ctx.beginPath();
        const cx = this.cx, cy = this.cy;
        if (this.atkDir === -2) { // Down
          ctx.arc(cx, cy, 40, 0, Math.PI);
          ctx.arc(cx, cy - 20, 50, Math.PI, 0, true);
        } else if (this.atkDir === 2) { // Up
          ctx.arc(cx, cy, 40, Math.PI, Math.PI * 2);
          ctx.arc(cx, cy + 20, 50, Math.PI * 2, Math.PI, true);
        } else { // Side
          const startA = this.atkDir === 1 ? -Math.PI / 2 : Math.PI / 2;
          const endA = this.atkDir === 1 ? Math.PI / 2 : -Math.PI / 2;
          ctx.arc(cx, cy, 45, startA, endA);
          ctx.arc(cx - this.atkDir * 20, cy, 55, endA, startA, true);
        }
        ctx.fill();

        // Sharp slash line
        ctx.strokeStyle = `rgba(255, 255, 255, ${1 - p2})`;
        ctx.lineWidth = 4 - p2 * 3;
        ctx.stroke();

        ctx.restore();
      }
    }

    // Wall-slide индикатор (Sparkles)
    if (this.onWall !== 0 && !this.grounded && this.dy > 0) {
      const wx = this.onWall === 1 ? this.x - 2 : this.x + this.w + 2;
      if (!lowPerf) {
        ctx.fillStyle = '#fff';
        if (Math.random() < 0.5) pts.emit(wx, this.y + this.h * 0.8, 1, { color: '#a0d0ff', speed: 1, up: 2, size: 2 });
      }
      ctx.fillStyle = 'rgba(160,200,255,.6)';
      ctx.fillRect(wx - 1, this.y + 10, 2, this.h - 20);
    }

    // Ульта — кольцо
    if (this.ultActive > 0) {
      const pulse = this.ultActive / 40;
      ctx.globalAlpha = pulse * .8; ctx.strokeStyle = '#e0b0ff';
      if (!lowPerf) { ctx.shadowColor = '#cc44ff'; ctx.shadowBlur = 30; }
      ctx.lineWidth = 4; ctx.beginPath();
      ctx.arc(this.cx, this.cy, 65 * (1 - pulse * .4), 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;

      // Внутреннее сияние
      const ug = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, 60);
      ug.addColorStop(0, `rgba(200,100,255,${pulse * 0.5})`);
      ug.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ug; ctx.fillRect(this.cx - 60, this.cy - 60, 120, 120);
    }

    // Индикатор готовности ульты
    if (this.ultCD <= 0 && this.mana >= this.maxMana) {
      ctx.globalAlpha = .5 + .5 * Math.sin(Date.now() * .008);
      ctx.fillStyle = '#e0a0ff';
      ctx.shadowColor = '#cc44ff'; ctx.shadowBlur = 10;
      // Значок над головой
      ctx.beginPath();
      ctx.moveTo(this.cx, this.y - 12);
      ctx.lineTo(this.cx + 5, this.y - 20);
      ctx.lineTo(this.cx, this.y - 28);
      ctx.lineTo(this.cx - 5, this.y - 20);
      ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    for (const b of this.bolts) b.draw();
  }

  _shape(x, y, ghost) {
    const f = this.facing, t = Date.now() * 0.003;

    // Animations mechanics
    const isIdle = this.anim === 'idle';
    const isRun = this.anim === 'run';
    const isJump = this.anim === 'jump';
    const isDash = this.dashTime > 0;

    const breath = isIdle ? Math.sin(t * 1.2) * 2 : 0;
    const bob = isRun ? Math.abs(Math.sin(Date.now() * 0.012)) * 3 : 0;
    const lean = isDash ? 8 * f : (isRun ? 4 * f : 0);

    const H_BODY = 30; // Высота самого тела без головы/рогов
    const Y_BODY = y + this.h - H_BODY - breath + bob;
    const Y_HEAD = Y_BODY - 14;

    ctx.save();
    ctx.translate(x + this.w * 0.5, y + this.h);
    ctx.rotate(lean * Math.PI / 180); // Наклон корпуса
    ctx.translate(-(x + this.w * 0.5), -(y + this.h));

    // --- 1. Cloak (Плащ) ---
    const cloakColor = ghost ? '#7a5ab0' : '#28203c';
    const cloakGlow = ghost ? '#9f7fe8' : '#1e162d';

    const cg = ctx.createLinearGradient(x, Y_BODY, x, y + this.h);
    cg.addColorStop(0, cloakColor); cg.addColorStop(1, cloakGlow);
    ctx.fillStyle = cg;

    ctx.beginPath();
    // Воротник
    ctx.moveTo(x + 10, Y_BODY);
    ctx.lineTo(x + this.w - 10, Y_BODY);

    // Правый край (ветер раздувает)
    const capeSway = isIdle ? Math.sin(t * 0.8) * 3 : (f === -1 ? 8 : -8);
    ctx.quadraticCurveTo(x + this.w, y + this.h * 0.6, x + this.w - 6 + capeSway, y + this.h - 2);

    // Низ рваного плаща
    ctx.lineTo(x + this.w - 12 + capeSway, y + this.h - 6);
    ctx.lineTo(x + this.w * 0.5 + capeSway, y + this.h);
    ctx.lineTo(x + 8 + capeSway, y + this.h - 4);

    // Левый край
    ctx.quadraticCurveTo(x, y + this.h * 0.6, x + 10, Y_BODY);
    ctx.fill();

    if (!ghost) {
      // Тень под воротником
      ctx.fillStyle = '#110c1c';
      ctx.beginPath();
      ctx.moveTo(x + 10, Y_BODY);
      ctx.lineTo(x + this.w - 10, Y_BODY);
      ctx.lineTo(x + this.w * 0.5, Y_BODY + 8);
      ctx.fill();
    }

    // --- 2. Head & Horns (Маска) ---
    const headColor = ghost ? '#c9a0dc' : '#eef2f5';
    ctx.fillStyle = headColor;

    // Круглая маска
    ctx.beginPath();
    ctx.ellipse(x + this.w * 0.5, Y_HEAD + 6, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Рога (Horns)
    ctx.beginPath();
    ctx.moveTo(x + this.w * 0.5 - 6, Y_HEAD);
    ctx.quadraticCurveTo(x + this.w * 0.5 - 12, Y_HEAD - 10, x + this.w * 0.5 - 14, Y_HEAD - 15);
    ctx.quadraticCurveTo(x + this.w * 0.5 - 6, Y_HEAD - 8, x + this.w * 0.5 - 2, Y_HEAD - 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + this.w * 0.5 + 6, Y_HEAD);
    ctx.quadraticCurveTo(x + this.w * 0.5 + 12, Y_HEAD - 10, x + this.w * 0.5 + 14, Y_HEAD - 15);
    ctx.quadraticCurveTo(x + this.w * 0.5 + 6, Y_HEAD - 8, x + this.w * 0.5 + 2, Y_HEAD - 2);
    ctx.fill();

    // --- 3. Eyes (Глаза) ---
    // Смотрим в сторону facing
    const eyeOffsetX = f === 1 ? 2 : -2;
    ctx.fillStyle = ghost ? '#fff' : '#110c1c'; // чёрные пустые глазницы

    ctx.beginPath();
    ctx.ellipse(x + this.w * 0.5 - 4 + eyeOffsetX, Y_HEAD + 6, 2.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + this.w * 0.5 + 4 + eyeOffsetX, Y_HEAD + 6, 2.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye glow (Void / Soul light emerging)
    if (!ghost) {
      ctx.fillStyle = '#c9a0dc';
      if (!lowPerf) { ctx.shadowColor = '#c9a0dc'; ctx.shadowBlur = 8; }

      // Светящиеся зрачки и trail-эффект при дэше
      const trailOffset = isDash || isRun ? -f * 6 : 0;

      ctx.beginPath();
      ctx.ellipse(x + this.w * 0.5 - 4 + eyeOffsetX, Y_HEAD + 6, 1, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + this.w * 0.5 + 4 + eyeOffsetX, Y_HEAD + 6, 1, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Шлейф от глаз при движении
      if (isRun || isDash) {
        ctx.globalAlpha = isDash ? 0.8 : 0.4;
        ctx.fillRect(x + this.w * 0.5 - 4 + eyeOffsetX + trailOffset, Y_HEAD + 5, -trailOffset, 1.5);
        ctx.fillRect(x + this.w * 0.5 + 4 + eyeOffsetX + trailOffset, Y_HEAD + 5, -trailOffset, 1.5);
        ctx.globalAlpha = 1;
      }

      ctx.shadowBlur = 0;
    }

    // --- 4. Weapon / Nail (Гвоздь-меч) ---
    if (!ghost) {
      ctx.save();
      // Позиция оружия зависит от того, атакуем ли мы
      if (this.attacking) {
        ctx.translate(this.cx, Y_BODY + 5);
        // Смещение меча во время удара
        const rot = this.atkDir === -2 ? Math.PI : (this.atkDir === 2 ? 0 : (f === 1 ? Math.PI / 2 : -Math.PI / 2));
        ctx.rotate(rot);
        ctx.translate(-this.cx, -(Y_BODY + 5));
        ctx.translate(this.cx, Y_BODY - 25);
      } else {
        // Оружие за спиной / у бедра
        ctx.translate(x + this.w * 0.5 - f * 12, Y_BODY + 10);
        ctx.rotate(f * Math.PI / 6);
        ctx.translate(-(x + this.w * 0.5 - f * 12), -(Y_BODY + 10));
      }

      // Рукоять
      ctx.fillStyle = '#3a2830';
      ctx.fillRect(x + this.w * 0.5 - 1 - f * 12, Y_BODY, 3, 10);
      // Лезвие (сколотое, как в HK)
      const bg = ctx.createLinearGradient(x + this.w * 0.5 - f * 12, Y_BODY - 22, x + this.w * 0.5 - f * 12, Y_BODY);
      bg.addColorStop(0, '#d0e0e0'); bg.addColorStop(1, '#8090a0');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(x + this.w * 0.5 - 2 - f * 12, Y_BODY);
      ctx.lineTo(x + this.w * 0.5 + 2 - f * 12, Y_BODY);
      ctx.lineTo(x + this.w * 0.5 + 1 - f * 12, Y_BODY - 20); // сломанный край
      ctx.lineTo(x + this.w * 0.5 - f * 12, Y_BODY - 22); // острие
      ctx.fill();

      ctx.restore();
    }

    // --- 5. Heal Aura Glow ---
    if (this.mana >= this.healCostMult && !ghost) {
      if (!lowPerf) { ctx.shadowColor = '#4fc3f7'; ctx.shadowBlur = 12; }
      ctx.globalAlpha = 0.2 + 0.2 * Math.sin(t * 3);
      ctx.fillStyle = '#4fc3f7';
      ctx.beginPath();
      ctx.ellipse(x + this.w * 0.5, Y_BODY + 6, 16, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════
//  BASE ENEMY
// ══════════════════════════════════════════════════════════
class BaseEnemy {
  constructor(x, y, w, h, hp) {
    this.x = x; this.y = y; this.w = w || 34; this.h = h || 38;
    this.dx = 0; this.dy = 0; this.grounded = false; this.facing = 1;
    this.hp = hp || 4; this.maxHp = hp || 4; this.alive = true; this.deathTimer = 0;
    this.inv = 0; this.stun = 0; this.pt = Math.random() * 100;
  }
  get cx() { return this.x + this.w * .5; }
  get cy() { return this.y + this.h * .5; }

  physics(dt, plats, GY) {
    this.dy += .72 * dt; if (this.dy > 18) this.dy = 18;
    this.x += this.dx * dt; this.y += this.dy * dt; this.grounded = false;
    for (const p of plats) { if (ov(this, p)) { const s = res(this, p); if (s === 'T') this.grounded = true; } }
    this.x = Math.max(0, Math.min(99999, this.x));
  }

  // Проверяет есть ли платформа впереди (чтобы не упасть в яму)
  hasPlatformAhead(dx, plats) {
    const probeX = this.cx + Math.sign(dx) * (this.w * .7);
    const probeY = this.y + this.h + 6;
    for (const p of plats) {
      if (p.t === 'W') continue;
      if (probeX > p.x && probeX < p.x + p.w && probeY > p.y && probeY < p.y + p.h + 30) return true;
    }
    return false;
  }

  hpBar() {
    ctx.fillStyle = '#1a0010'; ctx.fillRect(this.x, this.y - 10, this.w, 4);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(this.x, this.y - 10, this.w * (this.hp / this.maxHp), 4);
  }

  baseTakeDmg(a, kbX, kbY) {
    if (this.inv > 0 || !this.alive) return false;
    this.hp -= a; this.inv = 18; this.stun = 10; this.dx = kbX; this.dy = kbY;
    pts.emit(this.cx, this.cy, 10, { color: '#e74c3c', speed: 4, up: 2 }); snd('hit');
    if (this.hp <= 0) {
      this.alive = false;
      spawnDrop(this.cx, this.cy, this.maxHp);
      pts.emit(this.cx, this.cy, 22, { color: '#ffd700', speed: 5, up: 3, size: 5 });
      snd('death'); return true;
    }
    return true;
  }
}

// ══════════════════════════════════════════════════════════
//  ZONE 1 ENEMIES
// ══════════════════════════════════════════════════════════

// ── Wraith (Зона 1, базовый) ──────────────────────────────
class Wraith extends BaseEnemy {
  constructor(x, y, p1, p2) {
    super(x, y, 34, 38, 4);
    this.pat = [p1, p2]; this.pi = 0; this.speed = 1.4; this.aggro = 280; this.atkR = 52; this.atkCD = 0; this.state = 'patrol';
  }

  update(dt, plats, pl, GY) {
    if (!this.alive) { this.deathTimer += dt; return; }
    this.pt += dt; if (this.inv > 0) this.inv--; if (this.atkCD > 0) this.atkCD--;
    const ddx = pl.cx - this.cx, dist_ = Math.hypot(ddx, pl.cy - this.cy);
    if (this.stun > 0) { this.stun -= dt; this.dx *= .7; }
    else if (dist_ < this.aggro && pl.alive && !bossActive) {
      const wantDx = Math.sign(ddx) * this.speed;
      const safe = this.grounded ? this.hasPlatformAhead(wantDx, plats) : true;
      if (dist_ < this.atkR && this.atkCD <= 0) {
        this.state = 'attack'; this.dx = 0;
        if (pl.inv <= 0) { pl.takeDmg(1, Math.sign(ddx) * 7, -4); this.atkCD = 72; }
      } else if (safe) { this.state = 'chase'; this.dx = wantDx; this.facing = Math.sign(ddx) || this.facing; }
      else { this.state = 'wait'; this.dx = 0; }
    } else if (!bossActive) {
      this.state = 'patrol'; const tgt = this.pat[this.pi];
      if (Math.abs(this.cx - tgt) < 10) this.pi = this.pi === 0 ? 1 : 0;
      const patDx = Math.sign(tgt - this.cx) * this.speed * .6;
      const safe = this.grounded ? this.hasPlatformAhead(patDx, plats) : true;
      if (safe) { this.dx = patDx; this.facing = Math.sign(tgt - this.cx) || this.facing; }
      else { this.dx = 0; this.pi = this.pi === 0 ? 1 : 0; }
    } else { this.dx *= .85; }
    this.physics(dt, plats, GY);

    // Столкновение + парирование
    if (pl.alive && ov(this, pl)) {
      if (parryWindow > 0) {
        this.baseTakeDmg(3, Math.sign(this.cx - pl.cx) * 10, -8);
        parryWindow = 0; parryCD = Math.floor(PARRY_CD * .5);
        cam.shake(14);
        pts.emit(this.cx, this.cy, lowPerf ? 8 : 20, { color: '#ffffff', speed: 7, spread: Math.PI * 2, grav: 0, size: 4 });
        pts.emit(pl.cx, pl.cy, lowPerf ? 6 : 14, { color: '#88ccff', speed: 5, spread: Math.PI * 2, grav: 0 });
        floatTxt(this.cx, this.y - 30, '⚡ ПАРИРОВАНИЕ!', '#88ccff');
        document.getElementById('parry-flash').classList.add('active');
        setTimeout(() => document.getElementById('parry-flash').classList.remove('active'), 80);
      } else if (pl.inv <= 0) pl.takeDmg(1, Math.sign(ddx) * 7, -4);
    }
  }

  takeDmg(a, kbX, kbY) { return this.baseTakeDmg(a, kbX, kbY); }

  draw() {
    if (!this.alive) { if (this.deathTimer < 40) ctx.globalAlpha = 1 - this.deathTimer / 40; else return; }
    if (this.inv > 0 && Math.floor(this.inv / 4) % 2 === 0) ctx.globalAlpha = .4;

    const t = Date.now() * 0.002;
    const f = this.facing;
    const isAtk = this.state === 'attack';
    const bob = Math.sin(t * 1.5 + this.x) * 4;
    const cx = this.x + this.w * 0.5, cy = this.y + this.h * 0.5 + bob;

    ctx.save();
    ctx.translate(cx, cy); ctx.scale(f, 1); ctx.translate(-cx, -cy);

    // Aura
    if (!lowPerf) {
      const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
      aura.addColorStop(0, 'rgba(80, 20, 120, 0.4)');
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.ellipse(cx, cy, 30, 40, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Ghostly body tail
    ctx.fillStyle = 'rgba(100,60,160,0.6)';
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy + 15);
    ctx.quadraticCurveTo(cx - 20 - Math.sin(t * 3) * 10, cy + 30 + Math.cos(t * 2) * 5, cx - 5, cy + 45);
    ctx.quadraticCurveTo(cx + 5, cy + 30, cx + 10, cy + 15);
    ctx.fill();

    // Body mantle
    const mantle = ctx.createLinearGradient(0, cy - 20, 0, cy + 20);
    mantle.addColorStop(0, '#2d1b4e'); mantle.addColorStop(1, '#1a0f2e');
    ctx.fillStyle = mantle;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 18, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mask
    ctx.fillStyle = '#e0d8ef';
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 5);
    ctx.quadraticCurveTo(cx, cy - 25, cx + 12, cy - 5);
    ctx.lineTo(cx + 8, cy + 10);
    ctx.lineTo(cx - 8, cy + 10);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#110a1a';
    ctx.beginPath(); ctx.ellipse(cx + 3, cy - 2, 2.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 9, cy - 2, 2.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();

    // Glowing pupil
    if (isAtk) {
      ctx.fillStyle = '#ff4040';
      ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 10;
      ctx.fillRect(cx + 2, cy - 2, 2, 2); ctx.fillRect(cx + 8, cy - 2, 2, 2);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#a060ff';
      ctx.fillRect(cx + 3, cy - 3, 1, 1); ctx.fillRect(cx + 9, cy - 3, 1, 1);
    }

    // Attack claws
    if (isAtk) {
      const atkP = 1 - (this.atkCD / 50); // Progress
      ctx.fillStyle = '#ff4040';
      ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(cx + 15 + atkP * 20, cy);
      ctx.lineTo(cx + 35 + atkP * 30, cy - 10 + Math.sin(atkP * Math.PI) * 20);
      ctx.lineTo(cx + 25 + atkP * 15, cy + 10);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
    this.hpBar(); ctx.globalAlpha = 1;
  }
}

// ── Shield Wraith (Зона 1, блокирует фронтальные удары) ───
class ShieldWraith extends BaseEnemy {
  constructor(x, y, p1, p2) {
    super(x, y, 38, 42, 6);
    this.pat = [p1, p2]; this.pi = 0; this.speed = 1.2; this.aggro = 260; this.atkR = 55; this.atkCD = 0; this.state = 'patrol';
  }

  update(dt, plats, pl, GY) {
    if (!this.alive) { this.deathTimer += dt; return; }
    this.pt += dt; if (this.inv > 0) this.inv--; if (this.atkCD > 0) this.atkCD--;
    const ddx = pl.cx - this.cx, dist_ = Math.hypot(ddx, pl.cy - this.cy);
    this.facing = dist_ < this.aggro ? Math.sign(ddx) || this.facing : this.facing;
    if (this.stun > 0) { this.stun -= dt; this.dx *= .7; }
    else if (dist_ < this.aggro && pl.alive && !bossActive) {
      const wantDx = Math.sign(ddx) * this.speed;
      const safe = this.grounded ? this.hasPlatformAhead(wantDx, plats) : true;
      if (dist_ < this.atkR && this.atkCD <= 0) {
        this.state = 'attack'; this.dx = 0;
        if (pl.inv <= 0) { pl.takeDmg(1, Math.sign(ddx) * 6, -3); this.atkCD = 85; }
      } else if (safe) { this.state = 'chase'; this.dx = wantDx; }
      else { this.state = 'wait'; this.dx = 0; }
    } else if (!bossActive) {
      this.state = 'patrol'; const tgt = this.pat[this.pi];
      if (Math.abs(this.cx - tgt) < 10) this.pi = this.pi === 0 ? 1 : 0;
      const patDx = Math.sign(tgt - this.cx) * this.speed * .5;
      const safe = this.grounded ? this.hasPlatformAhead(patDx, plats) : true;
      if (safe) { this.dx = patDx; this.facing = Math.sign(tgt - this.cx) || this.facing; }
      else { this.dx = 0; this.pi = this.pi === 0 ? 1 : 0; }
    } else { this.dx *= .85; }
    this.physics(dt, plats, GY);
  }

  // Щит блокирует удары спереди — бить нужно сзади!
  takeDmg(a, kbX, kbY, isFromBehind) {
    if (!isFromBehind && Math.sign(kbX) === this.facing) {
      pts.emit(this.cx - this.facing * 20, this.cy, 6, { color: '#aaaaff', speed: 3, up: 1 });
      floatTxt(this.cx, this.y - 20, 'BLOCK!', '#8888ff');
      return false;
    }
    return this.baseTakeDmg(a, kbX, kbY);
  }

  draw() {
    if (!this.alive) { if (this.deathTimer < 40) ctx.globalAlpha = 1 - this.deathTimer / 40; else return; }
    if (this.inv > 0 && Math.floor(this.inv / 4) % 2 === 0) ctx.globalAlpha = .4;

    const t = Date.now() * 0.002;
    const f = this.facing;
    const isAtk = this.state === 'attack';
    const cx = this.x + this.w * 0.5, cy = this.y + this.h * 0.5;

    ctx.save();
    ctx.translate(cx, cy); ctx.scale(f, 1); ctx.translate(-cx, -cy);

    // Body (armored wraith)
    const mantle = ctx.createLinearGradient(0, cy - 25, 0, cy + 25);
    mantle.addColorStop(0, '#3a2050'); mantle.addColorStop(1, '#100820');
    ctx.fillStyle = mantle;
    ctx.beginPath(); ctx.ellipse(cx - 5, cy, 22, 26, 0, 0, Math.PI * 2); ctx.fill();

    // Helmet
    ctx.fillStyle = '#9080A0';
    ctx.fillRect(cx - 15, cy - 20, 20, 25);
    ctx.beginPath(); ctx.moveTo(cx - 15, cy - 20); ctx.lineTo(cx - 5, cy - 30); ctx.lineTo(cx + 5, cy - 20); ctx.fill(); // Horn

    // Glowing visor eye
    ctx.fillStyle = isAtk ? '#ff2020' : '#d0a0ff';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
    ctx.fillRect(cx - 5, cy - 12, 12, 4);
    ctx.shadowBlur = 0;

    // Shield (Heavy Greatshield)
    const shX = cx + 8;
    const shY = cy - 10;
    // Shield glow
    if (!lowPerf) {
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 3);
      ctx.shadowColor = '#6030a0'; ctx.shadowBlur = 20;
      ctx.strokeStyle = '#6030a0'; ctx.lineWidth = 4;
      ctx.strokeRect(shX - 2, shY - 2, 14, 38);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    // Shield solid
    const sg = ctx.createLinearGradient(shX, shY, shX + 10, shY);
    sg.addColorStop(0, '#4a4a5a'); sg.addColorStop(1, '#20202a');
    ctx.fillStyle = sg;
    ctx.fillRect(shX, shY, 10, 34);

    // Shield runes
    ctx.fillStyle = '#c9a0dc';
    ctx.fillRect(shX + 3, shY + 6, 4, 2);
    ctx.fillRect(shX + 3, shY + 16, 4, 2);
    ctx.fillRect(shX + 3, shY + 26, 4, 2);

    // Spear attack
    if (isAtk) {
      const atkP = 1 - (this.atkCD / 60);
      ctx.fillStyle = '#c0c0d0';
      ctx.fillRect(cx + 8 + atkP * 30, cy + 5, 40, 4); // spear shaft
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); // spear tip
      ctx.moveTo(cx + 48 + atkP * 30, cy + 3);
      ctx.lineTo(cx + 58 + atkP * 30, cy + 7);
      ctx.lineTo(cx + 48 + atkP * 30, cy + 11);
      ctx.fill();
    }

    ctx.restore();
    this.hpBar(); ctx.globalAlpha = 1;
  }
}

// ══════════════════════════════════════════════════════════
//  ZONE 2 ENEMIES
// ══════════════════════════════════════════════════════════

// ── Bone Archer (Зона 2, дальняя атака) ───────────────────
class BoneArcher extends BaseEnemy {
  constructor(x, y, p1, p2) {
    super(x, y, 32, 40, 3);
    this.pat = [p1, p2]; this.pi = 0; this.speed = 1.5; this.aggro = 380; this.minRange = 180;
    this.atkCD = 0; this.state = 'patrol'; this.arrows = [];
  }

  update(dt, plats, pl, GY) {
    if (!this.alive) { this.deathTimer += dt; return; }
    this.pt += dt; if (this.inv > 0) this.inv--; if (this.atkCD > 0) this.atkCD--;
    const ddx = pl.cx - this.cx, dist_ = Math.hypot(ddx, pl.cy - this.cy);
    if (this.stun > 0) { this.stun -= dt; this.dx *= .7; }
    else if (dist_ < this.aggro && pl.alive) {
      if (dist_ > this.minRange && this.atkCD <= 0) {
        this.state = 'shoot'; this.dx = 0; this.facing = Math.sign(ddx) || this.facing;
        const a = Math.atan2(pl.cy - this.cy, ddx);
        this.arrows.push({ x: this.cx, y: this.cy, dx: Math.cos(a) * 8, dy: Math.sin(a) * 8, w: 18, h: 6, life: 100 });
        this.atkCD = 90; snd('attack');
      } else if (dist_ < this.minRange) {
        this.state = 'retreat'; this.dx = -Math.sign(ddx) * this.speed; this.facing = Math.sign(ddx) || this.facing;
      } else { this.state = 'idle'; this.dx *= .8; }
    } else {
      this.state = 'patrol'; const tgt = this.pat[this.pi];
      if (Math.abs(this.cx - tgt) < 10) this.pi = this.pi === 0 ? 1 : 0;
      this.dx = Math.sign(tgt - this.cx) * this.speed * .6;
      this.facing = Math.sign(tgt - this.cx) || this.facing;
    }
    this.physics(dt, plats, GY);
    // Стрелы
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arr = this.arrows[i];
      arr.x += arr.dx * dt; arr.y += arr.dy * dt; arr.dy += .1 * dt; arr.life -= dt;
      if (arr.life <= 0) { this.arrows.splice(i, 1); continue; }
      if (pl.alive && pl.inv <= 0 && ov(arr, pl)) {
        pl.takeDmg(1, arr.dx * .3, -3);
        pts.emit(arr.x, arr.y, 6, { color: '#c87820', speed: 3 });
        this.arrows.splice(i, 1);
      }
    }
  }

  takeDmg(a, kbX, kbY) { return this.baseTakeDmg(a, kbX, kbY); }

  draw() {
    if (!this.alive) { if (this.deathTimer < 40) ctx.globalAlpha = 1 - this.deathTimer / 40; else return; }
    if (this.inv > 0 && Math.floor(this.inv / 4) % 2 === 0) ctx.globalAlpha = .4;

    const f = this.facing;
    const cx = this.x + this.w * 0.5, cy = this.y + this.h * 0.5;
    const isAtk = this.state === 'attack' || this.state === 'wait_fire';
    const t = Date.now() * 0.005;

    ctx.save();
    ctx.translate(cx, cy); ctx.scale(f, 1); ctx.translate(-cx, -cy);

    // Bony Ribcage
    ctx.fillStyle = '#e0d8c8';
    ctx.fillRect(cx - 8, cy - 10, 16, 18);
    ctx.fillStyle = '#201815'; // Rib gaps
    for (let i = 0; i < 3; i++) ctx.fillRect(cx - 6, cy - 6 + i * 5, 12, 2);

    // Legs
    ctx.strokeStyle = '#e0d8c8'; ctx.lineWidth = 4;
    const walk = this.state !== 'wait' ? Math.sin(t * 2) * 8 : 0;
    ctx.beginPath(); ctx.moveTo(cx - 4, cy + 8); ctx.lineTo(cx - 6 + walk, cy + 24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 4, cy + 8); ctx.lineTo(cx + 6 - walk, cy + 24); ctx.stroke();

    // Bobbing Skull
    const headBob = Math.abs(Math.sin(t * 1.5)) * 3;
    ctx.fillStyle = '#f0e8d8';
    ctx.beginPath(); ctx.arc(cx + 2, cy - 18 + headBob, 10, 0, Math.PI * 2); ctx.fill();

    // Glowing Eyes
    ctx.fillStyle = isAtk ? '#ff4040' : '#ffa040';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.ellipse(cx + 6, cy - 19 + headBob, 2.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Bow
    ctx.strokeStyle = '#5c4033'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx + 12, cy + 2, 20, -Math.PI / 2.2, Math.PI / 2.2);
    ctx.stroke();

    // Arrows & bowstring
    if (isAtk) {
      const p = this.atkCD > 0 ? Math.max(0, (120 - this.atkCD) / 30) : 1; // 0 to 1 draw
      const drawAmt = Math.min(1, p) * 12;

      // Bowstring
      ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 14, cy - 16);
      ctx.lineTo(cx + 14 - drawAmt, cy + 2);
      ctx.lineTo(cx + 14, cy + 20);
      ctx.stroke();

      // Loaded Arrow
      ctx.fillStyle = '#ccc';
      ctx.fillRect(cx + 2 - drawAmt, cy + 1, 24 + drawAmt, 2);
      ctx.fillStyle = '#ff4040'; // flaming tip
      ctx.shadowColor = '#ff4040'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(cx + 26, cy - 1); ctx.lineTo(cx + 34, cy + 2); ctx.lineTo(cx + 26, cy + 5); ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // Idle bowstring
      ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx + 16, cy - 16); ctx.lineTo(cx + 16, cy + 20); ctx.stroke();
    }

    ctx.restore();

    // Flying Arrows
    ctx.fillStyle = '#8a5020';
    for (const arr of this.arrows) {
      ctx.save(); ctx.translate(arr.x, arr.y); ctx.rotate(Math.atan2(arr.dy, arr.dx));
      ctx.fillRect(-10, -1, 20, 2); // shaft
      ctx.fillStyle = '#ff4040';
      ctx.shadowColor = '#ff4040'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(10, -2); ctx.lineTo(16, 0); ctx.lineTo(10, 2); ctx.fill(); // tip
      ctx.fillStyle = '#fff'; ctx.fillRect(-12, -2, 4, 4); // fletching
      ctx.restore();
    }

    this.hpBar(); ctx.globalAlpha = 1;
  }
}

// ── Bone Warrior (Зона 2, таранная атака) ─────────────────
class BoneWarrior extends BaseEnemy {
  constructor(x, y, p1, p2) {
    super(x, y, 38, 44, 5);
    this.pat = [p1, p2]; this.pi = 0; this.speed = 1.5; this.aggro = 280; this.atkR = 60;
    this.atkCD = 0; this.state = 'patrol'; this.charging = false; this.chargeTimer = 0;
  }

  update(dt, plats, pl, GY) {
    if (!this.alive) { this.deathTimer += dt; return; }
    this.pt += dt; if (this.inv > 0) this.inv--; if (this.atkCD > 0) this.atkCD--;
    const ddx = pl.cx - this.cx, dist_ = Math.hypot(ddx, pl.cy - this.cy);
    if (this.stun > 0) { this.stun -= dt; this.dx *= .7; this.charging = false; }
    else if (this.charging) {
      this.chargeTimer -= dt;
      const safe = this.grounded ? this.hasPlatformAhead(this.facing, plats) : true;
      if (!safe) { this.charging = false; this.atkCD = 100; }
      else {
        this.dx = this.facing * 6;
        if (pl.alive && pl.inv <= 0 && ov(this, pl)) {
          pl.takeDmg(2, this.facing * 10, -5); this.charging = false; this.chargeTimer = 0;
        }
        if (this.chargeTimer <= 0 || !this.grounded) { this.charging = false; this.atkCD = 100; }
      }
    } else if (dist_ < this.aggro && pl.alive && !bossActive) {
      this.facing = Math.sign(ddx) || this.facing;
      const wantDx = Math.sign(ddx) * this.speed;
      const safe = this.grounded ? this.hasPlatformAhead(wantDx, plats) : true;
      if (dist_ < this.atkR && this.atkCD <= 0 && safe) {
        this.state = 'charge'; this.charging = true; this.chargeTimer = 35; this.dx = 0;
        pts.emit(this.cx, this.cy, lowPerf ? 4 : 8, { color: '#c87820', speed: 4, up: 1 });
      } else if (safe) { this.state = 'chase'; this.dx = wantDx; }
      else { this.state = 'wait'; this.dx = 0; }
    } else if (!bossActive) {
      this.state = 'patrol'; const tgt = this.pat[this.pi];
      if (Math.abs(this.cx - tgt) < 10) this.pi = this.pi === 0 ? 1 : 0;
      const patDx = Math.sign(tgt - this.cx) * this.speed * .6;
      const safe = this.grounded ? this.hasPlatformAhead(patDx, plats) : true;
      if (safe) { this.dx = patDx; this.facing = Math.sign(tgt - this.cx) || this.facing; }
      else { this.dx = 0; this.pi = this.pi === 0 ? 1 : 0; }
    } else { this.dx *= .85; }
    this.physics(dt, plats, GY);
  }

  takeDmg(a, kbX, kbY) { return this.baseTakeDmg(a, kbX, kbY); }

  draw() {
    if (!this.alive) { if (this.deathTimer < 40) ctx.globalAlpha = 1 - this.deathTimer / 40; else return; }
    if (this.inv > 0 && Math.floor(this.inv / 4) % 2 === 0) ctx.globalAlpha = .4;

    const f = this.facing;
    const cx = this.x + this.w * 0.5, cy = this.y + this.h * 0.5;
    const ch = this.charging;
    const t = Date.now() * 0.005;

    ctx.save();
    ctx.translate(cx, cy); ctx.scale(f, 1); ctx.translate(-cx, -cy);

    // Charge motion blur / trails
    if (ch && !lowPerf) {
      ctx.fillStyle = 'rgba(255, 100, 0, 0.3)';
      ctx.fillRect(cx - 30, cy - 10, 20, 30);
      pts.emit(cx - 10, cy + 10, 2, { color: '#ff6600', speed: 5, up: 1, angle: Math.PI, spread: 0.5 });
    }

    // Heavy Ribcage Armor
    ctx.fillStyle = '#b0a090';
    ctx.fillRect(cx - 12, cy - 8, 24, 20);
    ctx.fillStyle = '#402010'; // Leather straps
    ctx.fillRect(cx - 12, cy - 4, 24, 4);
    ctx.fillRect(cx - 12, cy + 4, 24, 4);

    // Legs
    ctx.strokeStyle = '#c0b0a0'; ctx.lineWidth = 5;
    const walk = this.state !== 'wait' ? (ch ? Math.sin(t * 4) * 12 : Math.sin(t * 2) * 6) : 0;
    ctx.beginPath(); ctx.moveTo(cx - 6, cy + 12); ctx.lineTo(cx - 8 + walk, cy + 24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 6, cy + 12); ctx.lineTo(cx + 8 - walk, cy + 24); ctx.stroke();

    // Helmeted Skull
    const headLen = ch ? 6 : 0; // Lean forward when charging
    ctx.translate(headLen, 0);
    ctx.fillStyle = '#e0d8c8';
    ctx.beginPath(); ctx.arc(cx + 4, cy - 18, 11, 0, Math.PI * 2); ctx.fill();
    // Iron Helmet
    ctx.fillStyle = '#505860';
    ctx.beginPath(); ctx.arc(cx + 4, cy - 20, 12, Math.PI, 0); ctx.fill();
    ctx.fillRect(cx - 8, cy - 20, 24, 6);

    // Glowing Angry Eyes
    ctx.fillStyle = ch ? '#ff2020' : '#ffaa00';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.ellipse(cx + 8, cy - 17, 3, 4, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.translate(-headLen, 0);

    // Giant Bone Club / Sword
    if (ch) {
      // Thrusting forward
      ctx.fillStyle = '#888'; ctx.fillRect(cx - 10, cy, 40, 8); // handle
      ctx.fillStyle = '#ffcc00'; ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.moveTo(cx + 25, cy - 4); ctx.lineTo(cx + 45, cy + 4); ctx.lineTo(cx + 25, cy + 12); ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // Dragging / Resting
      ctx.fillStyle = '#888'; ctx.fillRect(cx - 5, cy + 5, 8, 30);
      ctx.fillStyle = '#aaaaff'; ctx.shadowColor = '#8888ff'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(cx - 9, cy + 30); ctx.lineTo(cx - 1, cy + 45); ctx.lineTo(cx + 7, cy + 30); ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
    this.hpBar(); ctx.globalAlpha = 1;
  }
}

// ══════════════════════════════════════════════════════════
//  ZONE 3 ENEMIES
// ══════════════════════════════════════════════════════════

// ── Storm Drake (Зона 3, летающий) ────────────────────────
class StormDrake extends BaseEnemy {
  constructor(x, y, p1, p2) {
    super(x, y, 36, 28, 4);
    this.pat = [p1, p2]; this.pi = 0; this.speed = 2.2; this.aggro = 350;
    this.state = 'hover'; this.hovY = y; this.diving = false; this.diveTimer = 0; this.atkCD = 0; this.t = 0;
  }

  update(dt, plats, pl, GY) {
    if (!this.alive) { this.deathTimer += dt; return; }
    this.t += dt; if (this.inv > 0) this.inv--; if (this.atkCD > 0) this.atkCD--;
    const ddx = pl.cx - this.cx, dist_ = Math.hypot(ddx, pl.cy - this.cy);
    if (this.stun > 0) { this.stun -= dt; this.dx *= .7; this.dy *= .7; this.diving = false; }
    else if (this.diving) {
      this.diveTimer -= dt; this.dy = 8;
      if (pl.alive && pl.inv <= 0 && ov(this, pl)) { pl.takeDmg(1, ddx * .1, -6); this.diving = false; this.atkCD = 80; }
      if (this.y > pl.y + 80 || this.diveTimer <= 0) { this.diving = false; this.atkCD = 60; }
    } else if (dist_ < this.aggro && pl.alive) {
      this.state = 'hunt';
      this.dx += (Math.sign(ddx) * this.speed - this.dx) * .08;
      const targetY = pl.y - 80;
      this.dy += (targetY - this.y > 0 ? 1 : -1) * .3;
      if (Math.abs(ddx) < 60 && this.atkCD <= 0 && this.y < pl.y) {
        this.state = 'dive'; this.diving = true; this.diveTimer = 40; this.dx = 0;
        pts.emit(this.cx, this.cy, 8, { color: '#00c8ff', speed: 4, up: 0 });
      }
    } else {
      this.state = 'hover';
      const tgtX = this.pat[this.pi];
      if (Math.abs(this.cx - tgtX) < 20) this.pi = this.pi === 0 ? 1 : 0;
      this.dx += (Math.sign(tgtX - this.cx) * this.speed * .8 - this.dx) * .06;
      const targetY = this.hovY - 120 + Math.sin(this.t * .02) * 30;
      this.dy += (targetY - this.y > 0 ? .4 : -.4);
    }
    this.dy = Math.max(-8, Math.min(10, this.dy));
    this.dx = Math.max(-6, Math.min(6, this.dx));
    this.x += this.dx * dt; this.y += this.dy * dt;
    this.x = Math.max(0, this.x); this.facing = this.dx > 0 ? 1 : -1;
    if (pl.alive && pl.inv <= 0 && ov(this, pl) && !this.diving)
      pl.takeDmg(1, Math.sign(this.dx) * 5, -4);
  }

  takeDmg(a, kbX, kbY) { return this.baseTakeDmg(a, kbX, kbY); }

  draw() {
    if (!this.alive) { if (this.deathTimer < 40) ctx.globalAlpha = 1 - this.deathTimer / 40; else return; }
    if (this.inv > 0 && Math.floor(this.inv / 4) % 2 === 0) ctx.globalAlpha = .4;

    const f = this.facing;
    const cx = this.x + this.w * 0.5, cy = this.y + this.h * 0.5;
    const t = this.t;

    ctx.save();
    ctx.translate(cx, cy); ctx.scale(f, 1); ctx.translate(-cx, -cy);

    // Wings flapping
    const flap = Math.sin(t * 0.4) * 20;
    ctx.fillStyle = 'rgba(10, 40, 80, 0.8)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.quadraticCurveTo(cx - 30, cy - 30 - flap, cx - 40, cy - 10 - flap * 0.5);
    ctx.quadraticCurveTo(cx - 20, cy, cx, cy + 5);
    ctx.fill();

    // Body
    const g = ctx.createLinearGradient(cx, cy - 20, cx, cy + 20);
    g.addColorStop(0, '#103060'); g.addColorStop(1, '#081830');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, 20, 12, 0, 0, Math.PI * 2); ctx.fill();

    // Tail
    ctx.beginPath(); ctx.moveTo(cx - 15, cy); ctx.lineTo(cx - 35, cy + Math.sin(t * 0.2) * 10); ctx.lineTo(cx - 15, cy + 8); ctx.fill();

    // Head
    ctx.beginPath(); ctx.ellipse(cx + 18, cy - 6, 10, 8, Math.PI / 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffaa00'; // Eye
    ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.ellipse(cx + 22, cy - 8, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Electrical sparks around body
    if (!lowPerf) {
      ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 1; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 6;
      for (let i = 0; i < 3; i++) {
        const sx = cx - 15 + Math.random() * 30, sy = cy - 10 + Math.random() * 20;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 3 - Math.random() * 6, sy + 3 - Math.random() * 6); ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    // Lightning Blast Charge
    if (this.state === 'attack' || this.state === 'wait_fire') {
      const charge = this.atkCD > 0 ? (100 - this.atkCD) / 100 : 1;
      ctx.fillStyle = `rgba(0, 255, 255, ${charge})`;
      ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.arc(cx + 26, cy - 2, 4 + charge * 6, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
    this.hpBar(); ctx.globalAlpha = 1;
  }
}

// ── Thunder Knight (Зона 3, электрический пульс) ──────────
class ThunderKnight extends BaseEnemy {
  constructor(x, y, p1, p2) {
    super(x, y, 40, 46, 6);
    this.pat = [p1, p2]; this.pi = 0; this.speed = 1.3; this.aggro = 280; this.atkR = 70;
    this.atkCD = 0; this.pulseCD = 0; this.state = 'patrol'; this.t = 0;
  }

  update(dt, plats, pl, GY) {
    if (!this.alive) { this.deathTimer += dt; return; }
    this.t += dt; if (this.inv > 0) this.inv--; if (this.atkCD > 0) this.atkCD--; if (this.pulseCD > 0) this.pulseCD--;
    const ddx = pl.cx - this.cx, dist_ = Math.hypot(ddx, pl.cy - this.cy);
    if (this.stun > 0) { this.stun -= dt; this.dx *= .7; }
    else if (dist_ < this.aggro && pl.alive) {
      this.facing = Math.sign(ddx) || this.facing;
      if (dist_ < this.atkR && this.atkCD <= 0) {
        this.state = 'attack'; this.dx = 0;
        if (pl.inv <= 0) { pl.takeDmg(1, Math.sign(ddx) * 6, -4); this.atkCD = 70; }
      } else {
        const wantDx = Math.sign(ddx) * this.speed;
        const safe = this.grounded ? this.hasPlatformAhead(wantDx, plats) : true;
        if (safe) { this.state = 'chase'; this.dx = wantDx; }
        else { this.state = 'wait'; this.dx = 0; }
      }
      // Электрический пульс в ближнем бою
      if (this.pulseCD <= 0 && dist_ < 110 && pl.alive && pl.inv <= 0) {
        pl.takeDmg(2, Math.sign(ddx) * 3, -5); cam.shake(8);
        pts.emit(this.cx, this.cy, lowPerf ? 10 : 20, { color: '#00ffff', speed: 5, up: 2, size: 3 });
        floatTxt(this.cx, this.y - 20, '⚡ PULSE', '#00ffff'); this.pulseCD = 180;
      }
    } else if (!bossActive) {
      this.state = 'patrol'; const tgt = this.pat[this.pi];
      if (Math.abs(this.cx - tgt) < 10) this.pi = this.pi === 0 ? 1 : 0;
      const patDx = Math.sign(tgt - this.cx) * this.speed * .6;
      const safe = this.grounded ? this.hasPlatformAhead(patDx, plats) : true;
      if (safe) { this.dx = patDx; this.facing = Math.sign(tgt - this.cx) || this.facing; }
      else { this.dx = 0; this.pi = this.pi === 0 ? 1 : 0; }
    } else { this.dx *= .85; }
    this.physics(dt, plats, GY);
  }

  takeDmg(a, kbX, kbY) { return this.baseTakeDmg(a, kbX, kbY); }

  draw() {
    if (!this.alive) { if (this.deathTimer < 40) ctx.globalAlpha = 1 - this.deathTimer / 40; else return; }
    if (this.inv > 0 && Math.floor(this.inv / 4) % 2 === 0) ctx.globalAlpha = .4;

    const f = this.facing;
    const cx = this.x + this.w * 0.5, cy = this.y + this.h * 0.5;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 0.12);

    ctx.save();
    ctx.translate(cx, cy); ctx.scale(f, 1); ctx.translate(-cx, -cy);

    // Armor background / Cloak
    ctx.fillStyle = '#102840'; ctx.fillRect(cx - 16, cy - 10, 32, 34);

    // Chestplate
    ctx.fillStyle = '#1c3c58';
    ctx.beginPath(); ctx.moveTo(cx - 18, cy - 20); ctx.lineTo(cx + 18, cy - 20);
    ctx.lineTo(cx + 14, cy + 5); ctx.lineTo(cx, cy + 12); ctx.lineTo(cx - 14, cy + 5); ctx.fill();

    // Helmet & Visor
    ctx.fillStyle = '#2a4c68';
    ctx.beginPath(); ctx.arc(cx, cy - 15, 12, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#0a1a2a'; // Visor slit
    ctx.fillRect(cx - 8, cy - 15, 16, 6);

    // Glowing eye line (Cylon style)
    ctx.fillStyle = `rgba(0, 255, 255, ${0.6 + 0.4 * pulse})`;
    ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 10;
    const eyeOscillate = Math.sin(this.t * 0.05) * 6; // eye moves back and forth slightly
    ctx.fillRect(cx - 2 + eyeOscillate, cy - 14, 4, 4);
    ctx.shadowBlur = 0;

    // Glowing Runes / Trim
    ctx.strokeStyle = `rgba(0, 220, 255, ${0.4 + 0.4 * pulse})`;
    ctx.lineWidth = 2; ctx.shadowColor = '#00c8ff'; ctx.shadowBlur = 15 * pulse;
    ctx.beginPath(); ctx.moveTo(cx - 12, cy - 2); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx + 12, cy - 2); ctx.stroke();

    // Shoulder pads
    ctx.fillStyle = '#1c3c58';
    ctx.beginPath(); ctx.arc(cx - 18, cy - 15, 8, 0, Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 18, cy - 15, 8, 0, Math.PI); ctx.fill();
    ctx.shadowBlur = 0;

    // Weapon / Halberd
    ctx.translate(cx, cy);
    if (this.state === 'attack') {
      ctx.rotate(Math.PI / 4 * (1 - this.atkCD / 70));
    }
    // shaft
    ctx.fillStyle = '#444'; ctx.fillRect(10, -35, 4, 60);
    // blade
    ctx.fillStyle = '#00ffff'; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 15;
    ctx.beginPath(); ctx.moveTo(8, -25); ctx.lineTo(25, -35); ctx.lineTo(12, -45); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore(); // Undo inner rotate/translate

    // Pulse Field Alert
    if (this.pulseCD > 0 && this.pulseCD < 30) {
      ctx.save();
      const charge = (30 - this.pulseCD) / 30; // 0 -> 1
      ctx.strokeStyle = `rgba(0, 255, 255, ${charge})`;
      ctx.lineWidth = 2 + charge * 2; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(cx, cy, 30 + charge * 50, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    this.hpBar(); ctx.globalAlpha = 1;
  }
}

// ── Factory ───────────────────────────────────────────────
function makeEnemy(def, GY) {
  const { type, x, y, p1, p2 } = def;
  if (type === 'wraith') return new Wraith(x, y, p1, p2);
  if (type === 'shield') return new ShieldWraith(x, y, p1, p2);
  if (type === 'archer') return new BoneArcher(x, y, p1, p2);
  if (type === 'warrior') return new BoneWarrior(x, y, p1, p2);
  if (type === 'drake') return new StormDrake(x, y, p1, p2);
  if (type === 'thunder') return new ThunderKnight(x, y, p1, p2);
  console.warn('Unknown enemy type:', type);
  return null;
}