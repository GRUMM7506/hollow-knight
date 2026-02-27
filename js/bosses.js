// ============================================================
//  bosses.js — Три босса: Король Пустоты, Лич, Титан Бури
// ============================================================

'use strict';

// ══════════════════════════════════════════════════════════
//  BOSS KING — Зона 1 «Бездна»
// ══════════════════════════════════════════════════════════
class BossKing {
  constructor(x, y) {
    this.x=x; this.y=y; this.w=100; this.h=110;
    this.dx=0; this.dy=0; this.grounded=false; this.facing=1;
    this.maxHp=40; this.hp=40; this.alive=true; this.appeared=false;
    this.phase=1; this.inv=0; this.atkCD=0; this.state='idle'; this.sTimer=0;
    this.projs=[]; this.dOrbs=[];
    this.animTick=0; this.shakeBody=0; this.deathTimer=0;
    this._bossName = 'КОРОЛЬ ПУСТОТЫ';
  }
  get cx() { return this.x + this.w*.5; }
  get cy() { return this.y + this.h*.5; }

  _shoot(pl, n) {
    const base = Math.atan2(pl.cy - this.cy, pl.cx - this.cx);
    const spd  = this.phase===2 ? 7.5 : 5.5;
    for (let i=0; i<n; i++) {
      const a = base + (i - (n-1)*.5) * .28;
      this.projs.push({ x:this.cx-10, y:this.cy-10, w:20, h:20, dx:Math.cos(a)*spd, dy:Math.sin(a)*spd, life:110 });
    }
  }

  update(dt, plats, pl, GY) {
    if (!this.appeared || !this.alive) { if (!this.alive) this.deathTimer += dt; return; }
    this.animTick += dt;
    if (this.inv > 0) this.inv--;
    if (this.atkCD > 0) this.atkCD--;

    // Переход в фазу 2
    if (this.hp <= this.maxHp*.5 && this.phase===1) {
      this.phase = 2; cam.shake(22);
      pts.emit(this.cx, this.cy, 50, { color:'#9a00dc', speed:9, up:4, size:8 });
      floatTxt(this.cx, this.y-40, '⚡ PHASE 2', '#ff60ff');
    }

    const ddx = pl.cx - this.cx; this.facing = Math.sign(ddx)||1;
    this.sTimer -= dt;
    if (this.sTimer <= 0) {
      const r = Math.random();
      if (this.phase===1) {
        if      (r < .3)  { this.state='walk';  this.sTimer=100; }
        else if (r < .5)  { this.state='jump';  this.sTimer=65;  this.dy=-15; snd('jump'); }
        else if (r < .7)  { this.state='slam';  this.sTimer=75;  this.dy=-12; }
        else              { this.state='shoot'; this.sTimer=85;  this._shoot(pl,3); }
      } else {
        if      (r < .2)  { this.state='walk';  this.sTimer=60; }
        else if (r < .4)  { this.state='jump';  this.sTimer=55;  this.dy=-17; snd('jump'); }
        else if (r < .55) { this.state='slam';  this.sTimer=65;  this.dy=-13; }
        else if (r < .75) { this.state='shoot'; this.sTimer=70;  this._shoot(pl,5); }
        else              { this.state='rage';  this.sTimer=130; }
      }
    }

    if      (this.state==='walk') { this.dx += Math.sign(ddx)*(this.phase===2?.38:.26); this.dx=Math.max(-5,Math.min(5,this.dx)); }
    else if (this.state==='slam') {
      this.dx *= .94;
      if (this.grounded && this.dy===0) {
        cam.shake(18); pts.emit(this.cx, this.y+this.h, 24, { color:'#6a00dc', spread:.7, angle:Math.PI, speed:7, up:2 });
        if (pl.grounded && Math.abs(ddx) < 320) pl.takeDmg(1, -pl.facing*5, -4);
        this.state='idle'; this.sTimer=50;
      }
    }
    else if (this.state==='rage') {
      this.dx = this.facing * 7;
      if (pl.inv <= 0 && ov(this, pl)) pl.takeDmg(1, this.facing*9, -5);
    }
    else this.dx *= .88;

    // Фаза 2: падающие сферы (dOrbs)
    if (this.phase===2 && Math.random() < .006*dt) {
      this.dOrbs.push({ x:pl.x+(Math.random()-.5)*180, y:pl.y-70, delay:65+Math.random()*35 });
    }
    for (let i=this.dOrbs.length-1; i>=0; i--) {
      const o = this.dOrbs[i]; o.delay -= dt;
      if (o.delay <= 0) {
        const a = Math.atan2(pl.cy-o.y, pl.cx-o.x);
        this.projs.push({ x:o.x, y:o.y, w:20, h:20, dx:Math.cos(a)*7, dy:Math.sin(a)*7, life:120 });
        pts.emit(o.x+10, o.y+10, 8, { color:'#c000ff', speed:3, grav:0 });
        this.dOrbs.splice(i, 1);
      }
    }

    // Физика
    this.dy += .58*dt; if (this.dy > 18) this.dy = 18;
    this.x += this.dx*dt; this.y += this.dy*dt; this.grounded = false;
    for (const p of plats) { if (ov(this,p)) { const s=res(this,p); if (s==='T') this.grounded=true; } }
    // Ограничиваем область арены (Бездна)
    this.x = Math.max(ABYSS.bossX-310, Math.min(ABYSS.W-120, this.x));
    if (this.x <= ABYSS.bossX-309 || this.x >= ABYSS.W-121) this.dx *= -1;

    if (pl.alive && pl.inv <= 0 && ov(this, pl)) pl.takeDmg(1, Math.sign(ddx)*8, -5);

    // Снаряды
    for (let i=this.projs.length-1; i>=0; i--) {
      const pr = this.projs[i]; pr.x+=pr.dx*dt; pr.y+=pr.dy*dt; pr.life-=dt;
      if (pr.life <= 0) { this.projs.splice(i,1); continue; }
      if (pl.alive && pl.inv<=0 && ov(pr,pl)) {
        pl.takeDmg(1, pr.dx*.3, -4);
        pts.emit(pr.x+10, pr.y+10, 8, { color:'#9a00dc', speed:3 });
        this.projs.splice(i,1);
      }
    }
    updateBoss(this.hp, this.maxHp);
  }

  takeDmg(a, kbX, kbY) {
    if (this.inv>0||!this.alive||!this.appeared) return false;
    this.hp -= a; this.inv=14; this.shakeBody=8;
    cam.shake(5); pts.emit(this.cx,this.cy,8,{color:'#c9a0dc',speed:4,up:2}); snd('hit');
    updateBoss(this.hp, this.maxHp);
    if (this.hp <= 0) {
      this.alive=false; bossActive=false; unlockArena(); cam.shake(28);
      for (let i=0;i<6;i++) setTimeout(()=>pts.emit(this.cx+(Math.random()-.5)*90,this.cy+(Math.random()-.5)*70,28,{color:'#9f7fe8',speed:6,up:3,size:6}),i*130);
      snd('death'); document.getElementById('boss-bar').style.display='none'; return true;
    }
    return true;
  }

  draw() {
    if (!this.appeared) return;
    if (!this.alive) { if (this.deathTimer<90) ctx.globalAlpha=1-this.deathTimer/90; else return; }
    if (this.inv>0&&Math.floor(this.inv/3)%2===0) ctx.globalAlpha=.5;
    const sh = this.shakeBody>0?(Math.random()-.5)*this.shakeBody:0; if (this.shakeBody>0) this.shakeBody--;
    const bx=this.x+sh, by=this.y, t=this.animTick, p2=this.phase===2;
    // Тень
    ctx.fillStyle='rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(bx+this.w*.5,by+this.h+4,this.w*.55,9,0,0,Math.PI*2); ctx.fill();
    // Тело
    const rg=ctx.createLinearGradient(bx,by,bx,by+this.h);
    rg.addColorStop(0,p2?'#3a005a':'#1e0840'); rg.addColorStop(1,p2?'#080014':'#04000e');
    ctx.fillStyle=rg; ctx.fillRect(bx+4,by+20,this.w-8,this.h-20);
    // «Юбка»
    ctx.fillStyle=p2?'#5a00aa':'#2a1458';
    for (let i=0;i<6;i++) { const fo=Math.sin(t*.09+i*.9)*4; ctx.fillRect(bx+4+i*(this.w-8)/6,by+this.h-10+fo,(this.w-8)/6-2,10+fo); }
    // Аура
    ctx.shadowColor=p2?'#b000ff':'#7a50c8'; ctx.shadowBlur=22;
    ctx.fillStyle=p2?'rgba(180,0,255,.38)':'rgba(120,80,200,.28)';
    ctx.beginPath(); ctx.arc(bx+this.w*.5,by+this.h*.55,19,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
    // Голова и корона
    ctx.fillStyle='#0c0820'; ctx.fillRect(bx+10,by,this.w-20,28);
    ctx.fillStyle=p2?'#9a00dc':'#5a3090';
    [[bx+12,by-18,bx+20,by],[bx+26,by-26,bx+33,by],[bx+this.w-33,by-26,bx+this.w-26,by],[bx+this.w-20,by-18,bx+this.w-12,by]].forEach(([x1,y1,x2,y2])=>{
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x1+9,y2); ctx.lineTo(x2-9,y2); ctx.fill();
    });
    // Глаза
    const ep=.6+.4*Math.sin(t*.1);
    ctx.fillStyle=p2?`rgba(255,0,200,${ep})`:`rgba(160,80,255,${ep})`;
    ctx.shadowColor=p2?'#ff00c8':'#a050ff'; ctx.shadowBlur=18;
    ctx.fillRect(bx+18,by+8,14,9); ctx.fillRect(bx+this.w-32,by+8,14,9); ctx.shadowBlur=0;
    // Фаза 2: лучи
    if (p2) {
      ctx.strokeStyle=`rgba(180,0,255,.22)`; ctx.lineWidth=2;
      for (let i=0;i<8;i++) { const ang=t*.025+i*(Math.PI*2/8),r=70+Math.sin(t*.06+i)*18; ctx.beginPath();ctx.moveTo(bx+this.w*.5,by+this.h*.5);ctx.lineTo(bx+this.w*.5+Math.cos(ang)*r,by+this.h*.5+Math.sin(ang)*r);ctx.stroke(); }
    }
    // Снаряды
    for (const pr of this.projs) {
      const pg=ctx.createRadialGradient(pr.x+10,pr.y+10,0,pr.x+10,pr.y+10,11);
      pg.addColorStop(0,'rgba(220,160,255,1)'); pg.addColorStop(1,'rgba(120,0,200,0)');
      ctx.fillStyle=pg; ctx.shadowColor='#9a00dc'; ctx.shadowBlur=16;
      ctx.beginPath(); ctx.arc(pr.x+10,pr.y+10,9,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
    }
    // dOrbs — предвестники
    for (const o of this.dOrbs) {
      const pulse=.4+.4*Math.sin(Date.now()*.02);
      ctx.globalAlpha=pulse; ctx.strokeStyle='#ff00ff'; ctx.lineWidth=2;
      ctx.shadowColor='#ff00ff'; ctx.shadowBlur=14;
      ctx.beginPath(); ctx.arc(o.x+10,o.y+10,12,0,Math.PI*2); ctx.stroke(); ctx.shadowBlur=0;
      ctx.globalAlpha=1;
    }
    ctx.globalAlpha=1;
  }
}

// ══════════════════════════════════════════════════════════
//  BOSS LICH — Зона 2 «Катакомбы»
// ══════════════════════════════════════════════════════════
class BossLich {
  constructor(x, y) {
    this.x=x; this.y=y; this.w=80; this.h=100;
    this.dx=0; this.dy=0; this.grounded=false; this.facing=1;
    this.maxHp=30; this.hp=30; this.alive=true; this.appeared=false;
    this.phase=1; this.inv=0; this.sTimer=0; this.state='idle';
    this.projs=[]; this.spikes=[]; this.animTick=0; this.deathTimer=0; this.floating=0;
    this._bossName = 'ЛИЧ';
  }
  get cx() { return this.x + this.w*.5; }
  get cy() { return this.y + this.h*.5; }

  _shoot(pl, n) {
    const base = Math.atan2(pl.cy-this.cy, pl.cx-this.cx);
    const spd  = this.phase===2 ? 6.5 : 4.8;
    for (let i=0; i<n; i++) {
      const a = base + (i-(n-1)*.5)*.32;
      this.projs.push({ x:this.cx, y:this.cy, w:18, h:18, dx:Math.cos(a)*spd, dy:Math.sin(a)*spd, life:100, trail:[] });
    }
  }
  _summonSpike(pl, GY) {
    this.spikes.push({ x:pl.x+(Math.random()-.5)*200, y:GY-80, w:16, h:80, life:120, warning:40 });
  }

  update(dt, plats, pl, GY) {
    if (!this.appeared||!this.alive) { if (!this.alive) this.deathTimer+=dt; return; }
    this.animTick+=dt; if (this.inv>0) this.inv--;

    if (this.hp<=this.maxHp*.5&&this.phase===1) {
      this.phase=2; cam.shake(20);
      pts.emit(this.cx,this.cy,40,{color:'#c87820',speed:8,up:3,size:7});
      floatTxt(this.cx,this.y-40,'💀 PHASE 2','#ff8800');
    }

    const ddx=pl.cx-this.cx; this.facing=Math.sign(ddx)||1;
    this.sTimer-=dt; this.floating=Math.sin(this.animTick*.03)*18;

    if (this.sTimer<=0) {
      const r=Math.random();
      if (this.phase===1) {
        if      (r<.35) { this.state='shoot'; this._shoot(pl,2); this.sTimer=80; }
        else if (r<.6)  { this.state='spike'; this._summonSpike(pl,GY); this.sTimer=90; }
        else            { this.state='move';  this.sTimer=70; }
      } else {
        if      (r<.3)  { this.state='shoot'; this._shoot(pl,4); this.sTimer=65; }
        else if (r<.55) { this.state='spike'; this._summonSpike(pl,GY); if(Math.random()<.5) this._summonSpike(pl,GY); this.sTimer=75; }
        else            { this.state='move';  this.sTimer=55; }
      }
    }

    if (this.state==='move') { this.dx+=Math.sign(ddx)*.3; this.dx=Math.max(-4,Math.min(4,this.dx)); }
    else this.dx*=.9;

    // Лич парит — Y рассчитывается напрямую, без физики
    this.x+=this.dx*dt;
    this.y=GY-140+this.floating;
    // Ограничения арены (Катакомбы)
    this.x=Math.max(CATACOMBS.bossX-310,Math.min(CATACOMBS.W-100,this.x));
    if (this.x<=CATACOMBS.bossX-309||this.x>=CATACOMBS.W-101) this.dx*=-1;

    // Черепа-снаряды
    for (let i=this.projs.length-1; i>=0; i--) {
      const pr=this.projs[i];
      pr.trail.push({x:pr.x+9,y:pr.y+9}); if (pr.trail.length>8) pr.trail.shift();
      pr.x+=pr.dx*dt; pr.y+=pr.dy*dt; pr.life-=dt;
      if (pr.life<=0) { this.projs.splice(i,1); continue; }
      if (pl.alive&&pl.inv<=0&&ov(pr,pl)) {
        pl.takeDmg(1,pr.dx*.3,-4); pts.emit(pr.x+9,pr.y+9,8,{color:'#c87820',speed:3}); this.projs.splice(i,1);
      }
    }
    // Костяные шипы
    for (let i=this.spikes.length-1; i>=0; i--) {
      const sp=this.spikes[i]; sp.life-=dt;
      if (sp.life<=0) { this.spikes.splice(i,1); continue; }
      if (sp.warning<=0&&pl.alive&&pl.inv<=0&&ov(sp,pl)) pl.takeDmg(1,-pl.facing*4,-6);
      sp.warning=Math.max(0,sp.warning-dt);
    }
    if (pl.alive&&pl.inv<=0&&ov(this,pl)) pl.takeDmg(1,Math.sign(ddx)*6,-5);
    updateBoss(this.hp,this.maxHp);
  }

  takeDmg(a,kbX,kbY) {
    if (this.inv>0||!this.alive||!this.appeared) return false;
    this.hp-=a; this.inv=12; cam.shake(4); pts.emit(this.cx,this.cy,8,{color:'#c87820',speed:4,up:2}); snd('hit');
    updateBoss(this.hp,this.maxHp);
    if (this.hp<=0) {
      this.alive=false; bossActive=false; unlockArena(); cam.shake(24);
      for (let i=0;i<5;i++) setTimeout(()=>pts.emit(this.cx+(Math.random()-.5)*80,this.cy+(Math.random()-.5)*60,24,{color:'#c87820',speed:5,up:3,size:5}),i*120);
      snd('death'); document.getElementById('boss-bar').style.display='none'; return true;
    }
    return true;
  }

  draw() {
    if (!this.appeared) return;
    if (!this.alive) { if (this.deathTimer<90) ctx.globalAlpha=1-this.deathTimer/90; else return; }
    if (this.inv>0&&Math.floor(this.inv/3)%2===0) ctx.globalAlpha=.5;
    const bx=this.x, by=this.y, t=this.animTick, p2=this.phase===2;
    // Тень
    ctx.fillStyle='rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(bx+this.w*.5,by+this.h+6,this.w*.45,8,0,0,Math.PI*2); ctx.fill();
    // Мантия
    const rg=ctx.createLinearGradient(bx,by,bx,by+this.h);
    rg.addColorStop(0,p2?'#3a1800':'#1a0c00'); rg.addColorStop(1,p2?'#0a0400':'#060200');
    ctx.fillStyle=rg; ctx.fillRect(bx+6,by+22,this.w-12,this.h-22);
    // Лохмотья
    ctx.fillStyle=p2?'#8a4010':'#4a2008';
    for (let i=0;i<5;i++) { const fo=Math.sin(t*.07+i)*5; ctx.fillRect(bx+6+i*(this.w-12)/5,by+this.h-8+fo,(this.w-12)/5-2,8+fo); }
    // Корона/голова
    ctx.fillStyle=p2?'#5a2800':'#2a1400'; ctx.fillRect(bx+12,by,this.w-24,26);
    ctx.fillStyle=p2?'#ff8800':'#a05820'; ctx.shadowColor=p2?'#ff8800':'#c07030'; ctx.shadowBlur=16;
    for (let i=0;i<3;i++) ctx.fillRect(bx+16+i*18,by-14,8,18); ctx.shadowBlur=0;
    // Глаза
    const ep=.7+.3*Math.sin(t*.12);
    ctx.fillStyle=p2?`rgba(255,120,0,${ep})`:`rgba(200,80,0,${ep})`;
    ctx.shadowColor=p2?'#ff8000':'#ff6000'; ctx.shadowBlur=14;
    ctx.fillRect(bx+18,by+8,12,8); ctx.fillRect(bx+this.w-30,by+8,12,8); ctx.shadowBlur=0;
    // Аура
    ctx.strokeStyle=p2?`rgba(255,120,0,.3)`:`rgba(180,80,0,.2)`; ctx.lineWidth=2;
    for (let i=0;i<6;i++) { const ang=t*.02+i*(Math.PI*2/6),r=60+Math.sin(t*.05+i)*15; ctx.beginPath();ctx.moveTo(bx+this.w*.5,by+this.h*.5);ctx.lineTo(bx+this.w*.5+Math.cos(ang)*r,by+this.h*.5+Math.sin(ang)*r);ctx.stroke(); }
    // Снаряды — черепа
    for (const pr of this.projs) {
      for (let i=0;i<pr.trail.length;i++) {
        ctx.globalAlpha=(i/pr.trail.length)*.35; ctx.fillStyle='#c87820';
        ctx.beginPath(); ctx.arc(pr.trail[i].x,pr.trail[i].y,4*(i/pr.trail.length),0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
      const sg=ctx.createRadialGradient(pr.x+9,pr.y+9,0,pr.x+9,pr.y+9,10);
      sg.addColorStop(0,'rgba(255,180,80,1)'); sg.addColorStop(1,'rgba(150,80,0,0)');
      ctx.fillStyle=sg; ctx.shadowColor='#c87820'; ctx.shadowBlur=14;
      ctx.beginPath(); ctx.arc(pr.x+9,pr.y+9,8,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
      // «Глаза» черепа
      ctx.fillStyle='#1a0800'; ctx.fillRect(pr.x+4,pr.y+5,4,4); ctx.fillRect(pr.x+11,pr.y+5,4,4);
    }
    // Костяные шипы
    for (const sp of this.spikes) {
      if (sp.warning>0) {
        ctx.globalAlpha=.3+.4*Math.sin(Date.now()*.04); ctx.fillStyle='#ff8800';
        ctx.fillRect(sp.x,sp.y,sp.w,sp.h); ctx.globalAlpha=1;
      } else {
        ctx.fillStyle='#c8a060'; ctx.shadowColor='#c87820'; ctx.shadowBlur=10;
        ctx.fillRect(sp.x,sp.y,sp.w,sp.h); ctx.shadowBlur=0;
        // Зубья шипа
        ctx.fillStyle='#e8c080';
        for (let i=0;i<3;i++) { ctx.beginPath();ctx.moveTo(sp.x,sp.y+i*20);ctx.lineTo(sp.x+sp.w*.5,sp.y+i*20-14);ctx.lineTo(sp.x+sp.w,sp.y+i*20);ctx.fill(); }
      }
    }
    ctx.globalAlpha=1;
  }
}

// ══════════════════════════════════════════════════════════
//  BOSS TITAN — Зона 3 «Грозовые Вершины»
// ══════════════════════════════════════════════════════════
class BossTitan {
  constructor(x, y) {
    this.x=x; this.y=y; this.w=130; this.h=140;
    this.dx=0; this.dy=0; this.grounded=false; this.facing=1;
    this.maxHp=50; this.hp=50; this.alive=true; this.appeared=false;
    this.phase=1; this.inv=0; this.sTimer=0; this.state='idle';
    this.projs=[]; this.lightnings=[]; this.animTick=0; this.deathTimer=0; this.shakeBody=0;
    this._bossName = 'ТИТАН БУРИ';
  }
  get cx() { return this.x + this.w*.5; }
  get cy() { return this.y + this.h*.5; }

  _throwBall(pl, n) {
    for (let i=0; i<n; i++) {
      const a=Math.atan2(pl.cy-this.cy,pl.cx-this.cx)+(i-(n-1)*.5)*.25;
      const spd=this.phase===2?7:5;
      this.projs.push({x:this.cx,y:this.cy,w:24,h:24,dx:Math.cos(a)*spd,dy:Math.sin(a)*spd,life:120,t:0});
    }
  }
  _summonLightning(pl) {
    const lx=pl.x+(Math.random()-.5)*300;
    this.lightnings.push({x:lx,y:0,w:20,h:PEAKS.GY,delay:50,life:80});
  }

  update(dt, plats, pl, GY) {
    if (!this.appeared||!this.alive) { if (!this.alive) this.deathTimer+=dt; return; }
    this.animTick+=dt; if (this.inv>0) this.inv--;

    if (this.hp<=this.maxHp*.5&&this.phase===1) {
      this.phase=2; cam.shake(25);
      pts.emit(this.cx,this.cy,60,{color:'#00c8ff',speed:10,up:5,size:8});
      floatTxt(this.cx,this.y-50,'⚡ PHASE 2','#00ffff');
    }

    const ddx=pl.cx-this.cx; this.facing=Math.sign(ddx)||1;
    this.sTimer-=dt;
    if (this.sTimer<=0) {
      const r=Math.random();
      if (this.phase===1) {
        if      (r<.3)  { this.state='walk';      this.sTimer=90; }
        else if (r<.5)  { this.state='slam';      this.dy=-14; this.sTimer=80; }
        else if (r<.75) { this.state='shoot';     this._throwBall(pl,2); this.sTimer=75; }
        else            { this.state='lightning'; this._summonLightning(pl); this.sTimer=100; }
      } else {
        if      (r<.2)  { this.state='walk';      this.sTimer=60; }
        else if (r<.38) { this.state='slam';      this.dy=-16; this.sTimer=65; }
        else if (r<.6)  { this.state='shoot';     this._throwBall(pl,3); this.sTimer=60; }
        else            { this.state='lightning'; this._summonLightning(pl); if(Math.random()<.6) this._summonLightning(pl); this.sTimer=80; }
      }
    }

    if (this.state==='walk') { this.dx+=Math.sign(ddx)*(this.phase===2?.4:.28); this.dx=Math.max(-5.5,Math.min(5.5,this.dx)); }
    else if (this.state==='slam') {
      this.dx*=.92;
      if (this.grounded&&this.dy===0) {
        cam.shake(22); pts.emit(this.cx,this.y+this.h,30,{color:'#00c8ff',spread:.8,angle:Math.PI,speed:8,up:3});
        if (pl.grounded&&Math.abs(ddx)<380) pl.takeDmg(1,-pl.facing*5,-5);
        this.state='idle'; this.sTimer=55;
      }
    }
    else this.dx*=.85;

    this.dy+=.55*dt; if (this.dy>18) this.dy=18;
    this.x+=this.dx*dt; this.y+=this.dy*dt; this.grounded=false;
    for (const p of plats) { if (ov(this,p)) { const s=res(this,p); if (s==='T') this.grounded=true; } }
    // Ограничения арены (Вершины)
    this.x=Math.max(PEAKS.bossX-310,Math.min(PEAKS.W-150,this.x));
    if (this.x<=PEAKS.bossX-309||this.x>=PEAKS.W-151) this.dx*=-1;

    if (pl.alive&&pl.inv<=0&&ov(this,pl)) pl.takeDmg(1,Math.sign(ddx)*9,-5);

    // Молнии-шары
    for (let i=this.projs.length-1;i>=0;i--) {
      const pr=this.projs[i]; pr.t+=dt; pr.x+=pr.dx*dt; pr.y+=pr.dy*dt; pr.life-=dt;
      if (pr.life<=0) { this.projs.splice(i,1); continue; }
      if (pl.alive&&pl.inv<=0&&ov(pr,pl)) {
        pl.takeDmg(1,pr.dx*.3,-4); pts.emit(pr.x+12,pr.y+12,12,{color:'#00ffff',speed:4}); this.projs.splice(i,1);
      }
    }
    // Удары молнии
    for (let i=this.lightnings.length-1;i>=0;i--) {
      const lt=this.lightnings[i]; lt.delay-=dt; lt.life-=dt;
      if (lt.delay<=0&&pl.alive&&pl.inv<=0&&ov(lt,pl)) {
        pl.takeDmg(2,0,-7); cam.shake(12); pts.emit(lt.x+10,pl.y,16,{color:'#00ffff',speed:5,up:3});
      }
      if (lt.life<=0) this.lightnings.splice(i,1);
    }
    updateBoss(this.hp,this.maxHp);
  }

  takeDmg(a,kbX,kbY) {
    if (this.inv>0||!this.alive||!this.appeared) return false;
    this.hp-=a; this.inv=14; this.shakeBody=8;
    cam.shake(5); pts.emit(this.cx,this.cy,10,{color:'#00c8ff',speed:4,up:2}); snd('hit');
    updateBoss(this.hp,this.maxHp);
    if (this.hp<=0) {
      this.alive=false; bossActive=false; unlockArena(); cam.shake(32);
      for (let i=0;i<7;i++) setTimeout(()=>pts.emit(this.cx+(Math.random()-.5)*110,this.cy+(Math.random()-.5)*80,30,{color:'#00c8ff',speed:7,up:4,size:6}),i*140);
      snd('death'); document.getElementById('boss-bar').style.display='none'; return true;
    }
    return true;
  }

  draw() {
    if (!this.appeared) return;
    if (!this.alive) { if (this.deathTimer<90) ctx.globalAlpha=1-this.deathTimer/90; else return; }
    if (this.inv>0&&Math.floor(this.inv/3)%2===0) ctx.globalAlpha=.5;
    const sh=this.shakeBody>0?(Math.random()-.5)*this.shakeBody:0; if (this.shakeBody>0) this.shakeBody--;
    const bx=this.x+sh, by=this.y, t=this.animTick, p2=this.phase===2;
    // Тень
    ctx.fillStyle='rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(bx+this.w*.5,by+this.h+6,this.w*.6,10,0,0,Math.PI*2); ctx.fill();
    // Бронированное тело
    const rg=ctx.createLinearGradient(bx,by,bx,by+this.h);
    rg.addColorStop(0,p2?'#003060':'#001c40'); rg.addColorStop(1,p2?'#000a20':'#000510');
    ctx.fillStyle=rg; ctx.fillRect(bx+8,by+24,this.w-16,this.h-24);
    // Наплечники
    ctx.fillStyle=p2?'#0060a0':'#003a6a'; ctx.shadowColor=p2?'#00c8ff':'#0080c0'; ctx.shadowBlur=16;
    ctx.fillRect(bx-14,by+24,32,36); ctx.fillRect(bx+this.w-18,by+24,32,36); ctx.shadowBlur=0;
    // Голова / шлем
    ctx.fillStyle=p2?'#002850':'#001830'; ctx.fillRect(bx+18,by,this.w-36,32);
    // Шипы на шлеме
    ctx.fillStyle=p2?'#00c8ff':'#008ab8'; ctx.shadowColor=p2?'#00ffff':'#00c0ff'; ctx.shadowBlur=14;
    for (let i=0;i<3;i++) ctx.fillRect(bx+28+i*22,by-18,8,22); ctx.shadowBlur=0;
    // Визор
    const ep=.7+.3*Math.sin(t*.1);
    ctx.fillStyle=p2?`rgba(0,255,255,${ep})`:`rgba(0,180,220,${ep})`; ctx.shadowColor='#00ffff'; ctx.shadowBlur=18;
    ctx.fillRect(bx+22,by+8,this.w-44,12); ctx.shadowBlur=0;
    // Электрические дуги в фазе 2
    if (p2) {
      ctx.strokeStyle=`rgba(0,255,255,${.3+.2*Math.sin(t*.2)})`; ctx.lineWidth=2;
      for (let i=0;i<6;i++) { const ang=t*.04+i*(Math.PI*2/6),r=80+Math.sin(t*.07+i)*20; ctx.beginPath();ctx.moveTo(bx+this.w*.5,by+this.h*.5);ctx.lineTo(bx+this.w*.5+Math.cos(ang)*r,by+this.h*.5+Math.sin(ang)*r);ctx.stroke(); }
    }
    // Молнии-шары
    for (const pr of this.projs) {
      const rg2=ctx.createRadialGradient(pr.x+12,pr.y+12,0,pr.x+12,pr.y+12,13);
      rg2.addColorStop(0,'rgba(220,255,255,1)'); rg2.addColorStop(.5,'rgba(0,200,255,1)'); rg2.addColorStop(1,'rgba(0,80,200,0)');
      ctx.fillStyle=rg2; ctx.shadowColor='#00c8ff'; ctx.shadowBlur=20;
      ctx.beginPath(); ctx.arc(pr.x+12,pr.y+12,12,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
      for (let i=0;i<4;i++) {
        const sa=pr.t*.15+i*(Math.PI*.5);
        ctx.fillStyle='rgba(0,255,255,.8)'; ctx.fillRect(pr.x+12+Math.cos(sa)*9,pr.y+12+Math.sin(sa)*9,3,3);
      }
    }
    // Молнии с неба
    for (const lt of this.lightnings) {
      if (lt.delay>0) {
        ctx.globalAlpha=.3+.3*Math.sin(Date.now()*.03); ctx.fillStyle='#00ffff';
        ctx.fillRect(lt.x,lt.y,lt.w,lt.h); ctx.globalAlpha=1;
      } else {
        ctx.globalAlpha=Math.min(1,lt.life/20);
        ctx.fillStyle='rgba(200,255,255,.8)'; ctx.shadowColor='#00ffff'; ctx.shadowBlur=30;
        ctx.fillRect(lt.x,lt.y,lt.w,lt.h); ctx.shadowBlur=0; ctx.globalAlpha=1;
      }
    }
    ctx.globalAlpha=1;
  }
}

// ── Factory ───────────────────────────────────────────────
function makeBoss(type, x, y) {
  if (type==='king')  return new BossKing(x, y);
  if (type==='lich')  return new BossLich(x, y);
  if (type==='titan') return new BossTitan(x, y);
  console.warn('Unknown boss type:', type);
  return null;
}