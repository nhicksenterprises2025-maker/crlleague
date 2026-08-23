(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const FIXED = 1 / 60;
  const CORE = { x: W / 2, y: H / 2, r: 82 };
  const MAX_ENERGY = 100;
  const ENERGY_REGEN = 18;
  const FIRE_COST = 8;
  const FIRE_CD = 0.22;
  const DASH_COST = 24;
  const DASH_CD = 2.2;
  const DASH_DIST = 140;
  const GUARD_COST = 30;
  const GUARD_TIME = 1.2;
  const CORE_RATE = 14;

  const obstacles = [
    { x: 420, y: 165, w: 62, h: 145 },
    { x: 420, y: 410, w: 62, h: 145 },
    { x: 798, y: 165, w: 62, h: 145 },
    { x: 798, y: 410, w: 62, h: 145 },
    { x: 585, y: 95, w: 110, h: 42 },
    { x: 585, y: 583, w: 110, h: 42 }
  ];

  const input = {
    moveX: 0, moveY: 0,
    aimX: 1, aimY: 0,
    firing: false,
    keys: new Set()
  };

  let state;
  let selectedDrone = null;
  let accumulator = 0;
  let last = performance.now();

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const len = (x, y) => Math.hypot(x, y);
  const normalize = (x, y) => {
    const l = Math.hypot(x, y);
    return l > 0.0001 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function makeCommander(id, team, x, y) {
    return {
      id, team, kind: 'COMMANDER', commander: true,
      x, y, r: 22, hp: 160, maxHp: 160,
      speed: team === 'player' ? 220 : 202,
      damage: 16, range: 620, projectileSpeed: 760,
      fireTimer: 0, dashTimer: 0, guardTimer: 0,
      energy: 100, alive: true
    };
  }

  function makeDrone(id, team, kind, x, y) {
    const stats = {
      ASSAULT: { hp: 70, speed: 150, damage: 10, cd: 0.65, range: 390, shot: 610 },
      SHIELD: { hp: 100, speed: 120, damage: 6, cd: 1.0, range: 330, shot: 560 },
      INTERCEPT: { hp: 55, speed: 190, damage: 8, cd: 0.45, range: 300, shot: 720 }
    }[kind];
    return {
      id, team, kind, commander: false,
      x, y, r: kind === 'SHIELD' ? 17 : 14,
      hp: stats.hp, maxHp: stats.hp,
      speed: stats.speed, damage: stats.damage, fireCd: stats.cd,
      range: stats.range, projectileSpeed: stats.shot,
      fireTimer: 0, targetX: x, targetY: y, alive: true
    };
  }

  function reset() {
    state = {
      time: 0,
      core: 0,
      over: false,
      player: makeCommander('pC', 'player', 170, 360),
      enemy: makeCommander('eC', 'enemy', 1110, 360),
      playerDrones: [
        makeDrone('pA', 'player', 'ASSAULT', 235, 300),
        makeDrone('pS', 'player', 'SHIELD', 235, 360),
        makeDrone('pI', 'player', 'INTERCEPT', 235, 420)
      ],
      enemyDrones: [
        makeDrone('eA', 'enemy', 'ASSAULT', 1045, 300),
        makeDrone('eS', 'enemy', 'SHIELD', 1045, 360),
        makeDrone('eI', 'enemy', 'INTERCEPT', 1045, 420)
      ],
      projectiles: []
    };
    state.enemyDrones[0].targetX = CORE.x + 95; state.enemyDrones[0].targetY = CORE.y - 78;
    state.enemyDrones[1].targetX = CORE.x + 105; state.enemyDrones[1].targetY = CORE.y;
    state.enemyDrones[2].targetX = CORE.x + 95; state.enemyDrones[2].targetY = CORE.y + 78;
    selectedDrone = null;
    document.getElementById('result').classList.add('hidden');
    document.querySelectorAll('.droneBtn').forEach(b => b.classList.remove('active'));
    setStatus('LIVE COMBAT / ZERO RNG');
    updateHud();
  }

  function allUnits(team) {
    const c = team === 'player' ? state.player : state.enemy;
    const ds = team === 'player' ? state.playerDrones : state.enemyDrones;
    return [c, ...ds].filter(u => u.alive);
  }

  function circleHitsRect(u, r) {
    const cx = clamp(u.x, r.x, r.x + r.w);
    const cy = clamp(u.y, r.y, r.y + r.h);
    return Math.hypot(u.x - cx, u.y - cy) < u.r;
  }

  function moveUnit(u, dx, dy) {
    if (!u.alive) return;
    const ox = u.x;
    u.x = clamp(u.x + dx, u.r + 18, W - u.r - 18);
    if (obstacles.some(r => circleHitsRect(u, r))) u.x = ox;
    const oy = u.y;
    u.y = clamp(u.y + dy, u.r + 70, H - u.r - 28);
    if (obstacles.some(r => circleHitsRect(u, r))) u.y = oy;
  }

  function nearestEnemy(u) {
    const targets = allUnits(u.team === 'player' ? 'enemy' : 'player');
    targets.sort((a, b) => {
      const da = dist(u, a), db = dist(u, b);
      if (Math.abs(da - db) > 0.001) return da - db;
      return a.id.localeCompare(b.id);
    });
    return targets[0] || null;
  }

  function fireProjectile(shooter, nx, ny, damage = shooter.damage, speed = shooter.projectileSpeed) {
    const n = normalize(nx, ny);
    if (!n.x && !n.y) return;
    state.projectiles.push({
      x: shooter.x + n.x * (shooter.r + 7),
      y: shooter.y + n.y * (shooter.r + 7),
      vx: n.x * speed, vy: n.y * speed,
      r: 4, team: shooter.team, damage, ttl: 1.7
    });
  }

  function playerFire() {
    const p = state.player;
    if (!p.alive || p.fireTimer > 0 || p.energy < FIRE_COST || !input.firing) return;
    p.energy -= FIRE_COST;
    p.fireTimer = FIRE_CD;
    fireProjectile(p, input.aimX, input.aimY);
  }

  function enemyFire() {
    const e = state.enemy;
    if (!e.alive || e.fireTimer > 0 || e.energy < FIRE_COST) return;
    if (dist(e, state.player) > 600) return;
    e.energy -= FIRE_COST;
    e.fireTimer = FIRE_CD;
    fireProjectile(e, state.player.x - e.x, state.player.y - e.y);
  }

  function droneThink(u, dt) {
    if (!u.alive) return;
    u.fireTimer = Math.max(0, u.fireTimer - dt);
    const dx = u.targetX - u.x, dy = u.targetY - u.y;
    const d = Math.hypot(dx, dy);
    if (d > 8) {
      const n = normalize(dx, dy);
      moveUnit(u, n.x * u.speed * dt, n.y * u.speed * dt);
    }
    const target = nearestEnemy(u);
    if (target && u.fireTimer <= 0 && dist(u, target) <= u.range) {
      u.fireTimer = u.fireCd;
      fireProjectile(u, target.x - u.x, target.y - u.y, u.damage, u.projectileSpeed);
    }
  }

  function enemyAI(dt) {
    const e = state.enemy;
    if (!e.alive) return;
    const p = state.player;
    const coreD = dist(e, CORE);
    let tx = CORE.x + 120, ty = CORE.y;

    if (coreD < 145) {
      tx = p.x;
      ty = p.y;
      const toward = normalize(tx - e.x, ty - e.y);
      const desired = dist(e, p) > 370 ? toward : { x: -toward.y, y: toward.x };
      moveUnit(e, desired.x * e.speed * dt, desired.y * e.speed * dt);
    } else {
      const n = normalize(tx - e.x, ty - e.y);
      moveUnit(e, n.x * e.speed * dt, n.y * e.speed * dt);
    }

    const threat = state.projectiles.find(q => q.team === 'player' && Math.hypot(q.x - e.x, q.y - e.y) < 170);
    if (threat && e.guardTimer <= 0 && e.energy >= GUARD_COST) {
      e.energy -= GUARD_COST;
      e.guardTimer = GUARD_TIME;
    }

    if (state.core > 56 && e.dashTimer <= 0 && e.energy >= DASH_COST && coreD > 170) {
      const n = normalize(CORE.x - e.x, CORE.y - e.y);
      e.energy -= DASH_COST;
      e.dashTimer = DASH_CD;
      moveUnit(e, n.x * DASH_DIST, n.y * DASH_DIST);
    }

    enemyFire();
  }

  function updatePlayer(dt) {
    const p = state.player;
    if (!p.alive) return;
    let mx = input.moveX, my = input.moveY;
    if (input.keys.has('w')) my -= 1;
    if (input.keys.has('s')) my += 1;
    if (input.keys.has('a')) mx -= 1;
    if (input.keys.has('d')) mx += 1;
    const n = normalize(mx, my);
    moveUnit(p, n.x * p.speed * dt, n.y * p.speed * dt);
    playerFire();
  }

  function updateCommanderTimers(c, dt) {
    c.fireTimer = Math.max(0, c.fireTimer - dt);
    c.dashTimer = Math.max(0, c.dashTimer - dt);
    c.guardTimer = Math.max(0, c.guardTimer - dt);
    c.energy = Math.min(MAX_ENERGY, c.energy + ENERGY_REGEN * dt);
  }

  function damageUnit(u, amount) {
    if (!u.alive) return;
    let dmg = amount;
    if (u.commander && u.guardTimer > 0) dmg *= 0.4;
    u.hp = Math.max(0, u.hp - dmg);
    if (u.hp <= 0) u.alive = false;
  }

  function projectileHitsObstacle(q) {
    return obstacles.some(r => q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h);
  }

  function updateProjectiles(dt) {
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const q = state.projectiles[i];
      q.x += q.vx * dt; q.y += q.vy * dt; q.ttl -= dt;
      if (q.ttl <= 0 || q.x < 0 || q.x > W || q.y < 0 || q.y > H || projectileHitsObstacle(q)) {
        state.projectiles.splice(i, 1); continue;
      }
      const targets = allUnits(q.team === 'player' ? 'enemy' : 'player');
      let hit = null;
      for (const u of targets) {
        if (Math.hypot(q.x - u.x, q.y - u.y) <= q.r + u.r) { hit = u; break; }
      }
      if (hit) {
        damageUnit(hit, q.damage);
        state.projectiles.splice(i, 1);
      }
    }
  }

  function updateCore(dt) {
    const pInside = allUnits('player').filter(u => dist(u, CORE) <= CORE.r).length;
    const eInside = allUnits('enemy').filter(u => dist(u, CORE) <= CORE.r).length;
    if (pInside > 0 && eInside === 0) state.core = Math.min(100, state.core + CORE_RATE * dt);
    if (eInside > 0 && pInside === 0) state.core = Math.max(-100, state.core - CORE_RATE * dt);
  }

  function checkVictory() {
    if (state.over) return;
    if (!state.enemy.alive) return finish(true, 'Enemy Commander eliminated.');
    if (!state.player.alive) return finish(false, 'Your Commander was eliminated.');
    if (state.core >= 100) return finish(true, 'You overloaded the central Core.');
    if (state.core <= -100) return finish(false, 'Enemy overloaded the central Core.');
  }

  function finish(win, reason) {
    state.over = true;
    input.firing = false;
    document.getElementById('resultTitle').textContent = win ? 'VICTORY' : 'DEFEAT';
    document.getElementById('resultReason').textContent = reason;
    document.getElementById('result').classList.remove('hidden');
  }

  function step(dt) {
    if (state.over) return;
    state.time += dt;
    updateCommanderTimers(state.player, dt);
    updateCommanderTimers(state.enemy, dt);
    updatePlayer(dt);
    enemyAI(dt);
    state.playerDrones.forEach(d => droneThink(d, dt));
    state.enemyDrones.forEach(d => droneThink(d, dt));
    updateProjectiles(dt);
    updateCore(dt);
    checkVictory();
  }

  function drawArena() {
    ctx.fillStyle = '#081018'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(102,133,157,.08)'; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    const g = ctx.createRadialGradient(CORE.x, CORE.y, 12, CORE.x, CORE.y, 155);
    g.addColorStop(0, 'rgba(230,231,123,.13)'); g.addColorStop(1, 'rgba(230,231,123,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 155, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d9df79'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.arc(CORE.x, CORE.y, CORE.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#d9df79'; ctx.globalAlpha = .25; ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;

    for (const r of obstacles) {
      ctx.fillStyle = '#1b2935'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#385063'; ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1);
      ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(r.x + 5, r.y + 5, r.w - 10, 4);
    }
  }

  function drawUnit(u) {
    if (!u.alive) return;
    const player = u.team === 'player';
    const color = player ? '#45d8ff' : '#ff8c42';
    ctx.save(); ctx.translate(u.x, u.y);
    ctx.fillStyle = player ? 'rgba(69,216,255,.13)' : 'rgba(255,140,66,.13)';
    ctx.beginPath(); ctx.arc(0, 0, u.r + 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = u.commander ? 3 : 2;
    if (u.commander) {
      ctx.beginPath(); ctx.moveTo(u.r, 0); ctx.lineTo(-u.r * .7, -u.r * .75); ctx.lineTo(-u.r * .7, u.r * .75); ctx.closePath(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, u.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = color; ctx.font = '800 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(u.kind === 'ASSAULT' ? 'A' : u.kind === 'SHIELD' ? 'S' : 'I', 0, 0);
    }
    const hp = u.hp / u.maxHp;
    ctx.fillStyle = '#030609'; ctx.fillRect(-u.r - 4, u.r + 10, (u.r + 4) * 2, 4);
    ctx.fillStyle = hp > .5 ? '#63e6a1' : hp > .25 ? '#e7e77b' : '#ff5d6c';
    ctx.fillRect(-u.r - 4, u.r + 10, (u.r + 4) * 2 * hp, 4);
    if (u.commander && u.guardTimer > 0) {
      ctx.strokeStyle = '#e7e77b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, u.r + 12, -.9, .9); ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    drawArena();
    state.projectiles.forEach(q => {
      ctx.fillStyle = q.team === 'player' ? '#8be8ff' : '#ffb27d';
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
    });
    [...state.playerDrones, ...state.enemyDrones, state.player, state.enemy].forEach(drawUnit);

    if (selectedDrone !== null) {
      const d = state.playerDrones[selectedDrone];
      if (d?.alive) {
        ctx.strokeStyle = '#45d8ff'; ctx.lineWidth = 2; ctx.setLineDash([5,5]);
        ctx.beginPath(); ctx.arc(d.targetX, d.targetY, 18, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.targetX, d.targetY); ctx.stroke();
      }
    }
  }

  function updateHud() {
    const p = state.player, e = state.enemy;
    document.getElementById('playerHp').textContent = `${Math.ceil(p.hp)} HP`;
    document.getElementById('enemyHp').textContent = `${Math.ceil(e.hp)} HP`;
    document.getElementById('energy').textContent = `${Math.floor(p.energy)} EN`;
    document.getElementById('playerHpBar').style.width = `${100 * p.hp / p.maxHp}%`;
    document.getElementById('enemyHpBar').style.width = `${100 * e.hp / e.maxHp}%`;
    state.playerDrones.forEach((d, i) => {
      document.getElementById(`d${i}hp`).textContent = d.alive ? Math.ceil(d.hp) : 'DOWN';
      document.querySelector(`.droneBtn[data-drone="${i}"]`).classList.toggle('dead', !d.alive);
    });
    const dash = document.getElementById('dashBtn');
    const guard = document.getElementById('guardBtn');
    dash.disabled = p.energy < DASH_COST || p.dashTimer > 0 || !p.alive;
    guard.disabled = p.energy < GUARD_COST || p.guardTimer > 0 || !p.alive;
    document.getElementById('dashCd').textContent = p.dashTimer > 0 ? `${p.dashTimer.toFixed(1)}s` : 'READY';
    document.getElementById('guardCd').textContent = p.guardTimer > 0 ? `${p.guardTimer.toFixed(1)}s` : 'READY';
    dash.classList.toggle('cooldown', p.dashTimer > 0);
    guard.classList.toggle('cooldown', p.guardTimer > 0);

    const marker = document.getElementById('coreMarker');
    marker.style.left = `${50 + state.core * .5}%`;
    const text = document.getElementById('coreText');
    text.textContent = Math.abs(state.core) < 1 ? 'CORE NEUTRAL' : state.core > 0 ? `YOU ${Math.floor(state.core)}%` : `ENEMY ${Math.floor(-state.core)}%`;
    text.style.color = state.core > 0 ? '#45d8ff' : state.core < 0 ? '#ff8c42' : '#7d8b98';
  }

  function setStatus(t) { document.getElementById('statusText').textContent = t; }

  function useDash() {
    const p = state.player;
    if (!p.alive || p.energy < DASH_COST || p.dashTimer > 0) return;
    let dx = input.moveX, dy = input.moveY;
    if (Math.hypot(dx, dy) < .15) { dx = input.aimX; dy = input.aimY; }
    const n = normalize(dx, dy);
    if (!n.x && !n.y) return;
    p.energy -= DASH_COST; p.dashTimer = DASH_CD;
    const steps = 7;
    for (let i = 0; i < steps; i++) moveUnit(p, n.x * DASH_DIST / steps, n.y * DASH_DIST / steps);
    setStatus('DASH COMMITTED');
  }

  function useGuard() {
    const p = state.player;
    if (!p.alive || p.energy < GUARD_COST || p.guardTimer > 0) return;
    p.energy -= GUARD_COST; p.guardTimer = GUARD_TIME;
    setStatus('GUARD ACTIVE / 60% DAMAGE REDUCTION');
  }

  function setupStick(el, kind) {
    let pid = null;
    const knob = el.querySelector('i');
    const update = e => {
      const r = el.getBoundingClientRect();
      let x = e.clientX - (r.left + r.width / 2);
      let y = e.clientY - (r.top + r.height / 2);
      const radius = r.width * .34;
      const l = Math.hypot(x, y);
      if (l > radius) { x *= radius / l; y *= radius / l; }
      knob.style.transform = `translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;
      const nx = x / radius, ny = y / radius;
      if (kind === 'move') { input.moveX = nx; input.moveY = ny; }
      else {
        if (Math.hypot(nx, ny) > .2) { const n = normalize(nx, ny); input.aimX = n.x; input.aimY = n.y; input.firing = true; }
        else input.firing = false;
      }
    };
    el.addEventListener('pointerdown', e => { pid = e.pointerId; el.setPointerCapture(pid); update(e); e.preventDefault(); });
    el.addEventListener('pointermove', e => { if (e.pointerId === pid) update(e); });
    const end = e => {
      if (e.pointerId !== pid) return;
      pid = null; knob.style.transform = 'translate(-50%,-50%)';
      if (kind === 'move') { input.moveX = 0; input.moveY = 0; }
      else input.firing = false;
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }

  setupStick(document.getElementById('leftStick'), 'move');
  setupStick(document.getElementById('rightStick'), 'aim');
  document.getElementById('dashBtn').addEventListener('pointerdown', e => { e.preventDefault(); useDash(); });
  document.getElementById('guardBtn').addEventListener('pointerdown', e => { e.preventDefault(); useGuard(); });
  document.getElementById('restart').addEventListener('click', reset);

  document.querySelectorAll('.droneBtn').forEach(btn => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.drone);
    if (!state.playerDrones[i].alive) return;
    selectedDrone = selectedDrone === i ? null : i;
    document.querySelectorAll('.droneBtn').forEach(b => b.classList.toggle('active', Number(b.dataset.drone) === selectedDrone));
    setStatus(selectedDrone === null ? 'DRONE COMMAND CANCELLED' : `${state.playerDrones[i].kind} DRONE SELECTED / TAP ARENA`);
  }));

  canvas.addEventListener('pointerdown', e => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W;
    const y = (e.clientY - r.top) / r.height * H;
    if (selectedDrone !== null) {
      const d = state.playerDrones[selectedDrone];
      if (d?.alive) {
        d.targetX = clamp(x, 30, W - 30); d.targetY = clamp(y, 85, H - 35);
        setStatus(`${d.kind} DRONE REPOSITIONING`);
      }
      return;
    }
    if (e.pointerType === 'mouse') {
      const n = normalize(x - state.player.x, y - state.player.y);
      input.aimX = n.x; input.aimY = n.y; input.firing = true;
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    const n = normalize(x - state.player.x, y - state.player.y);
    input.aimX = n.x; input.aimY = n.y;
  });
  window.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') input.firing = false; });
  window.addEventListener('keydown', e => {
    input.keys.add(e.key.toLowerCase());
    if (e.code === 'Space') { e.preventDefault(); useDash(); }
    if (e.key === 'Shift') useGuard();
  });
  window.addEventListener('keyup', e => input.keys.delete(e.key.toLowerCase()));

  function frame(now) {
    const elapsed = Math.min(.1, (now - last) / 1000); last = now; accumulator += elapsed;
    while (accumulator >= FIXED) { step(FIXED); accumulator -= FIXED; }
    draw(); updateHud(); requestAnimationFrame(frame);
  }

  reset();
  requestAnimationFrame(frame);
})();