(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const COLS = 11;
  const ROWS = 9;
  const CELL = 64;
  const CONTROL_TARGET = 12;
  const ENERGY_INCOME = 6;
  const ENERGY_CAP = 10;

  const TEAM = Object.freeze({ PLAYER: 'player', CPU: 'cpu' });
  const COST = Object.freeze({ move: 1, attack: 2, guard: 1, ability: 3, hold: 0 });

  const ARCHETYPES = Object.freeze({
    vanguard: {
      label: 'VANGUARD', maxHp: 110, move: 2, attackDamage: 35, attackRange: 1,
      ability: 'CRUSH', abilityDescription: '55 damage at range 1. Cooldown 2.',
      abilityType: 'damage', abilityDamage: 55, abilityRange: 1, abilityCooldown: 2,
      glyph: 'V'
    },
    ranger: {
      label: 'RANGER', maxHp: 70, move: 2, attackDamage: 28, attackRange: 5,
      ability: 'PIERCE', abilityDescription: '44 damage at range 7. Cooldown 3.',
      abilityType: 'damage', abilityDamage: 44, abilityRange: 7, abilityCooldown: 3,
      glyph: 'R'
    },
    scout: {
      label: 'SCOUT', maxHp: 65, move: 4, attackDamage: 22, attackRange: 1,
      ability: 'SURGE', abilityDescription: 'Reposition up to 6 tiles. Cooldown 3.',
      abilityType: 'move', abilityMove: 6, abilityCooldown: 3,
      glyph: 'S'
    }
  });

  const WALLS = new Set([
    '4,1', '6,1',
    '4,3', '6,3',
    '4,5', '6,5',
    '4,7', '6,7'
  ]);

  const CONTROL_NODES = Object.freeze([
    { x: 5, y: 2 },
    { x: 5, y: 4 },
    { x: 5, y: 6 }
  ]);

  let state;

  function makeUnit(id, team, type, x, y) {
    const a = ARCHETYPES[type];
    return {
      id, team, type, x, y,
      hp: a.maxHp,
      cooldown: 0,
      shield: 0,
      alive: true
    };
  }

  function resetGame() {
    state = {
      turn: 1,
      phase: 'planning',
      gameOver: false,
      selectedId: null,
      selectedAction: null,
      player: { energy: 6, score: 0 },
      cpu: { energy: 6, score: 0 },
      playerOrders: new Map(),
      units: [
        makeUnit('pV', TEAM.PLAYER, 'vanguard', 1, 2),
        makeUnit('pR', TEAM.PLAYER, 'ranger', 1, 4),
        makeUnit('pS', TEAM.PLAYER, 'scout', 1, 6),
        makeUnit('cV', TEAM.CPU, 'vanguard', 9, 2),
        makeUnit('cR', TEAM.CPU, 'ranger', 9, 4),
        makeUnit('cS', TEAM.CPU, 'scout', 9, 6)
      ],
      log: []
    };

    document.getElementById('resultOverlay').classList.add('hidden');
    logLine('TURN 1 — assign orders, then execute.', 'turn');
    logLine('Simulation seed: none. RNG calls: none.', 'system');
    updateUI();
    draw();
  }

  function unitById(id) {
    return state.units.find(u => u.id === id) || null;
  }

  function livingUnits(team = null) {
    return state.units.filter(u => u.alive && (!team || u.team === team));
  }

  function coordKey(x, y) { return `${x},${y}`; }
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
  function isWall(x, y) { return WALLS.has(coordKey(x, y)); }
  function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  function unitAt(x, y, ignoreId = null) {
    return state.units.find(u => u.alive && u.id !== ignoreId && u.x === x && u.y === y) || null;
  }

  function orderCost(order) {
    return order ? COST[order.type] : 0;
  }

  function setPlayerOrder(unit, order) {
    if (!unit || unit.team !== TEAM.PLAYER || !unit.alive || state.phase !== 'planning') return false;

    const previous = state.playerOrders.get(unit.id);
    const available = state.player.energy + orderCost(previous);
    const nextCost = orderCost(order);
    if (available < nextCost) {
      setHint(`Not enough Energy. ${order.type.toUpperCase()} costs ${nextCost}.`);
      return false;
    }

    state.player.energy = available - nextCost;
    state.playerOrders.set(unit.id, order);
    updateUI();
    draw();
    return true;
  }

  function clearPlayerPlan() {
    if (state.phase !== 'planning') return;
    for (const order of state.playerOrders.values()) state.player.energy += orderCost(order);
    state.playerOrders.clear();
    state.selectedAction = null;
    setHint('Plan cleared. Energy refunded.');
    updateUI();
    draw();
  }

  function getReachable(unit, maxSteps) {
    const start = coordKey(unit.x, unit.y);
    const visited = new Map([[start, 0]]);
    const queue = [{ x: unit.x, y: unit.y }];
    const dirs = [
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 }
    ];

    while (queue.length) {
      const cur = queue.shift();
      const steps = visited.get(coordKey(cur.x, cur.y));
      if (steps >= maxSteps) continue;

      for (const d of dirs) {
        const nx = cur.x + d.x;
        const ny = cur.y + d.y;
        const key = coordKey(nx, ny);
        if (!inBounds(nx, ny) || isWall(nx, ny) || visited.has(key)) continue;
        if (unitAt(nx, ny, unit.id)) continue;
        visited.set(key, steps + 1);
        queue.push({ x: nx, y: ny });
      }
    }

    visited.delete(start);
    return new Set(visited.keys());
  }

  function shortestPath(unit, target) {
    const startKey = coordKey(unit.x, unit.y);
    const queue = [{ x: unit.x, y: unit.y }];
    const cameFrom = new Map([[startKey, null]]);
    const dirs = [
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 }
    ];
    let endKey = null;

    while (queue.length) {
      const cur = queue.shift();
      if (cur.x === target.x && cur.y === target.y) {
        endKey = coordKey(cur.x, cur.y);
        break;
      }

      for (const d of dirs) {
        const nx = cur.x + d.x;
        const ny = cur.y + d.y;
        const key = coordKey(nx, ny);
        if (!inBounds(nx, ny) || isWall(nx, ny) || cameFrom.has(key)) continue;
        const occupant = unitAt(nx, ny, unit.id);
        if (occupant && !(nx === target.x && ny === target.y)) continue;
        cameFrom.set(key, coordKey(cur.x, cur.y));
        queue.push({ x: nx, y: ny });
      }
    }

    if (!endKey) return [];
    const path = [];
    let cursor = endKey;
    while (cursor && cursor !== startKey) {
      const [x, y] = cursor.split(',').map(Number);
      path.push({ x, y });
      cursor = cameFrom.get(cursor);
    }
    return path.reverse();
  }

  function lineCells(a, b) {
    const cells = [];
    let x0 = a.x;
    let y0 = a.y;
    const x1 = b.x;
    const y1 = b.y;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (!(x0 === x1 && y0 === y1)) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
      if (!(x0 === x1 && y0 === y1)) cells.push({ x: x0, y: y0 });
    }
    return cells;
  }

  function hasLineOfSight(a, b) {
    return !lineCells(a, b).some(c => isWall(c.x, c.y));
  }

  function canTarget(attacker, target, range) {
    return attacker.alive && target.alive && attacker.team !== target.team &&
      manhattan(attacker, target) <= range && hasLineOfSight(attacker, target);
  }

  function selectedUnit() {
    return unitById(state.selectedId);
  }

  function selectUnit(unit) {
    if (!unit || unit.team !== TEAM.PLAYER || !unit.alive || state.phase !== 'planning') return;
    state.selectedId = unit.id;
    state.selectedAction = null;
    setHint(`${ARCHETYPES[unit.type].label} selected. Choose an order.`);
    updateUI();
    draw();
  }

  function chooseAction(action) {
    const unit = selectedUnit();
    if (!unit || state.phase !== 'planning') {
      setHint('Select one of your living units first.');
      return;
    }

    const a = ARCHETYPES[unit.type];
    if (action === 'ability' && unit.cooldown > 0) {
      setHint(`${a.ability} is cooling down for ${unit.cooldown} more turn${unit.cooldown === 1 ? '' : 's'}.`);
      return;
    }

    if (action === 'guard' || action === 'hold') {
      if (setPlayerOrder(unit, { type: action })) {
        state.selectedAction = action;
        setHint(`${a.label}: ${action.toUpperCase()} locked.`);
      }
      return;
    }

    const previous = state.playerOrders.get(unit.id);
    const available = state.player.energy + orderCost(previous);
    if (available < COST[action]) {
      setHint(`Not enough Energy for ${action.toUpperCase()}.`);
      return;
    }

    state.selectedAction = action;
    if (action === 'move') setHint(`Choose a destination within ${a.move} tiles.`);
    if (action === 'attack') setHint(`Choose an enemy within range ${a.attackRange}. Walls block line of sight.`);
    if (action === 'ability') {
      setHint(a.abilityType === 'move'
        ? `Choose a SURGE destination within ${a.abilityMove} tiles.`
        : `Choose an enemy for ${a.ability} within range ${a.abilityRange}.`);
    }
    updateUI();
    draw();
  }

  function handleBoardClick(evt) {
    if (state.phase !== 'planning' || state.gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((evt.clientX - rect.left) / rect.width) * COLS);
    const y = Math.floor(((evt.clientY - rect.top) / rect.height) * ROWS);
    if (!inBounds(x, y)) return;

    const clickedUnit = unitAt(x, y);
    const unit = selectedUnit();

    if (!state.selectedAction) {
      if (clickedUnit && clickedUnit.team === TEAM.PLAYER) selectUnit(clickedUnit);
      else if (clickedUnit && clickedUnit.team === TEAM.CPU) setHint(`${ARCHETYPES[clickedUnit.type].label}: ${clickedUnit.hp}/${ARCHETYPES[clickedUnit.type].maxHp} HP.`);
      return;
    }

    if (!unit) return;
    const a = ARCHETYPES[unit.type];

    if (state.selectedAction === 'move') {
      const reachable = getReachable(unit, a.move);
      if (!reachable.has(coordKey(x, y))) {
        setHint('That tile is not reachable with MOVE.');
        return;
      }
      if (setPlayerOrder(unit, { type: 'move', target: { x, y } })) {
        setHint(`${a.label}: MOVE → ${gridName(x, y)} locked.`);
      }
    }

    if (state.selectedAction === 'attack') {
      if (!clickedUnit || clickedUnit.team !== TEAM.CPU || !canTarget(unit, clickedUnit, a.attackRange)) {
        setHint('Invalid ATTACK target: check range and line of sight.');
        return;
      }
      if (setPlayerOrder(unit, { type: 'attack', targetId: clickedUnit.id })) {
        setHint(`${a.label}: ATTACK → ${ARCHETYPES[clickedUnit.type].label} locked.`);
      }
    }

    if (state.selectedAction === 'ability') {
      if (unit.cooldown > 0) return;
      if (a.abilityType === 'move') {
        const reachable = getReachable(unit, a.abilityMove);
        if (!reachable.has(coordKey(x, y))) {
          setHint('That tile is not reachable with SURGE.');
          return;
        }
        if (setPlayerOrder(unit, { type: 'ability', target: { x, y } })) {
          setHint(`${a.label}: ${a.ability} → ${gridName(x, y)} locked.`);
        }
      } else {
        if (!clickedUnit || clickedUnit.team !== TEAM.CPU || !canTarget(unit, clickedUnit, a.abilityRange)) {
          setHint(`Invalid ${a.ability} target: check range and line of sight.`);
          return;
        }
        if (setPlayerOrder(unit, { type: 'ability', targetId: clickedUnit.id })) {
          setHint(`${a.label}: ${a.ability} → ${ARCHETYPES[clickedUnit.type].label} locked.`);
        }
      }
    }

    updateUI();
    draw();
  }

  function gridName(x, y) {
    return `${String.fromCharCode(65 + x)}${y + 1}`;
  }

  function defaultOrdersFor(team) {
    const orders = new Map();
    for (const unit of livingUnits(team)) orders.set(unit.id, { type: 'hold' });
    return orders;
  }

  function buildCpuOrders() {
    const orders = defaultOrdersFor(TEAM.CPU);
    let energy = state.cpu.energy;
    const cpuUnits = livingUnits(TEAM.CPU).sort((a, b) => a.id.localeCompare(b.id));

    for (const unit of cpuUnits) {
      const a = ARCHETYPES[unit.type];
      const enemies = livingUnits(TEAM.PLAYER).slice().sort((u1, u2) => {
        const d = manhattan(unit, u1) - manhattan(unit, u2);
        if (d !== 0) return d;
        const hp = u1.hp - u2.hp;
        return hp !== 0 ? hp : u1.id.localeCompare(u2.id);
      });

      const abilityTarget = a.abilityType === 'damage' && unit.cooldown === 0
        ? enemies.find(e => canTarget(unit, e, a.abilityRange))
        : null;
      if (abilityTarget && energy >= COST.ability) {
        orders.set(unit.id, { type: 'ability', targetId: abilityTarget.id });
        energy -= COST.ability;
        continue;
      }

      const attackTarget = enemies.find(e => canTarget(unit, e, a.attackRange));
      if (attackTarget && energy >= COST.attack) {
        orders.set(unit.id, { type: 'attack', targetId: attackTarget.id });
        energy -= COST.attack;
        continue;
      }

      if (unit.hp <= Math.ceil(a.maxHp * 0.34) && energy >= COST.guard) {
        orders.set(unit.id, { type: 'guard' });
        energy -= COST.guard;
        continue;
      }

      const targetNode = chooseCpuTargetNode(unit);
      if (targetNode && energy >= COST.move) {
        if (a.abilityType === 'move' && unit.cooldown === 0 && energy >= COST.ability && manhattan(unit, targetNode) > a.move + 1) {
          const destination = cpuPathDestination(unit, targetNode, a.abilityMove);
          if (destination) {
            orders.set(unit.id, { type: 'ability', target: destination });
            energy -= COST.ability;
            continue;
          }
        }
        const destination = cpuPathDestination(unit, targetNode, a.move);
        if (destination) {
          orders.set(unit.id, { type: 'move', target: destination });
          energy -= COST.move;
          continue;
        }
      }

      if (energy >= COST.guard) {
        orders.set(unit.id, { type: 'guard' });
        energy -= COST.guard;
      }
    }

    state.cpu.energy = energy;
    return orders;
  }

  function chooseCpuTargetNode(unit) {
    const nodes = CONTROL_NODES.slice().sort((n1, n2) => {
      const owner1 = unitAt(n1.x, n1.y);
      const owner2 = unitAt(n2.x, n2.y);
      const p1 = owner1 && owner1.team === TEAM.PLAYER ? 0 : owner1 && owner1.team === TEAM.CPU ? 2 : 1;
      const p2 = owner2 && owner2.team === TEAM.PLAYER ? 0 : owner2 && owner2.team === TEAM.CPU ? 2 : 1;
      if (p1 !== p2) return p1 - p2;
      const d = manhattan(unit, n1) - manhattan(unit, n2);
      if (d !== 0) return d;
      if (n1.y !== n2.y) return n1.y - n2.y;
      return n1.x - n2.x;
    });
    return nodes[0] || null;
  }

  function cpuPathDestination(unit, target, maxSteps) {
    const path = shortestPath(unit, target);
    if (!path.length) return null;
    for (let i = Math.min(maxSteps, path.length) - 1; i >= 0; i--) {
      const candidate = path[i];
      if (!unitAt(candidate.x, candidate.y, unit.id) && !isWall(candidate.x, candidate.y)) return candidate;
    }
    return null;
  }

  function executeTurn() {
    if (state.phase !== 'planning' || state.gameOver) return;
    state.phase = 'resolving';
    state.selectedAction = null;
    updateUI();

    const playerOrders = defaultOrdersFor(TEAM.PLAYER);
    for (const [id, order] of state.playerOrders.entries()) playerOrders.set(id, order);
    const cpuOrders = buildCpuOrders();

    logLine(`TURN ${state.turn} — EXECUTION`, 'turn');
    resolveOrders(playerOrders, cpuOrders);
    scoreControlNodes();
    checkVictory();

    if (!state.gameOver) advanceTurn();
    updateUI();
    draw();
  }

  function resolveOrders(playerOrders, cpuOrders) {
    const allOrders = new Map([...playerOrders, ...cpuOrders]);
    const usedAbility = new Set();

    for (const unit of livingUnits()) unit.shield = 0;

    for (const [id, order] of allOrders.entries()) {
      const unit = unitById(id);
      if (!unit || !unit.alive || order.type !== 'guard') continue;
      unit.shield = 25;
      logLine(`${teamWord(unit.team)} ${ARCHETYPES[unit.type].label} braces: 25 shield.`, unit.team);
    }

    const movementIntents = [];
    for (const [id, order] of allOrders.entries()) {
      const unit = unitById(id);
      if (!unit || !unit.alive) continue;
      const a = ARCHETYPES[unit.type];
      if (order.type === 'move' && order.target) {
        movementIntents.push({ unit, target: order.target, ability: false });
      }
      if (order.type === 'ability' && a.abilityType === 'move' && order.target && unit.cooldown === 0) {
        movementIntents.push({ unit, target: order.target, ability: true });
        usedAbility.add(unit.id);
        unit.cooldown = a.abilityCooldown;
      }
    }
    resolveMovement(movementIntents);

    const damageByTarget = new Map();
    for (const [id, order] of allOrders.entries()) {
      const unit = unitById(id);
      if (!unit || !unit.alive) continue;
      const a = ARCHETYPES[unit.type];

      if (order.type === 'attack') {
        const target = unitById(order.targetId);
        if (target && canTarget(unit, target, a.attackRange)) {
          addDamage(damageByTarget, target.id, a.attackDamage, unit, 'ATTACK');
        } else {
          logLine(`${teamWord(unit.team)} ${a.label} ATTACK lost range or line of sight.`, 'system');
        }
      }

      if (order.type === 'ability' && a.abilityType === 'damage') {
        if (unit.cooldown > 0) continue;
        const target = unitById(order.targetId);
        if (target && canTarget(unit, target, a.abilityRange)) {
          addDamage(damageByTarget, target.id, a.abilityDamage, unit, a.ability);
          usedAbility.add(unit.id);
          unit.cooldown = a.abilityCooldown;
        } else {
          logLine(`${teamWord(unit.team)} ${a.label} ${a.ability} lost range or line of sight.`, 'system');
        }
      }
    }

    for (const [targetId, packet] of damageByTarget.entries()) {
      const target = unitById(targetId);
      if (!target || !target.alive) continue;
      const absorbed = Math.min(target.shield, packet.total);
      const finalDamage = packet.total - absorbed;
      target.hp = Math.max(0, target.hp - finalDamage);
      if (absorbed > 0) logLine(`${ARCHETYPES[target.type].label} shield absorbs ${absorbed}.`, 'system');
      logLine(`${teamWord(target.team)} ${ARCHETYPES[target.type].label} takes ${finalDamage} damage.`, 'damage');
    }

    for (const unit of state.units) {
      if (unit.alive && unit.hp <= 0) {
        unit.alive = false;
        logLine(`${teamWord(unit.team)} ${ARCHETYPES[unit.type].label} eliminated.`, unit.team === TEAM.PLAYER ? TEAM.CPU : TEAM.PLAYER);
      }
    }

    for (const unit of livingUnits()) {
      if (unit.cooldown > 0 && !usedAbility.has(unit.id)) unit.cooldown -= 1;
    }
  }

  function resolveMovement(intents) {
    const destinationCounts = new Map();
    const originByUnit = new Map();
    for (const intent of intents) {
      const key = coordKey(intent.target.x, intent.target.y);
      destinationCounts.set(key, (destinationCounts.get(key) || 0) + 1);
      originByUnit.set(intent.unit.id, coordKey(intent.unit.x, intent.unit.y));
    }

    const movingIds = new Set(intents.map(i => i.unit.id));
    const valid = [];

    for (const intent of intents) {
      const { unit, target, ability } = intent;
      const a = ARCHETYPES[unit.type];
      const maxSteps = ability ? a.abilityMove : a.move;
      const reachable = getReachableForResolution(unit, maxSteps, movingIds);
      const key = coordKey(target.x, target.y);

      if (!reachable.has(key)) {
        logLine(`${teamWord(unit.team)} ${a.label} movement blocked.`, 'system');
        continue;
      }
      if (destinationCounts.get(key) > 1) {
        logLine(`Movement clash at ${gridName(target.x, target.y)}: all contenders bounce.`, 'system');
        continue;
      }

      const occupant = unitAt(target.x, target.y, unit.id);
      if (occupant && !movingIds.has(occupant.id)) {
        logLine(`${teamWord(unit.team)} ${a.label} destination occupied.`, 'system');
        continue;
      }

      valid.push(intent);
    }

    const rejectedSwapIds = new Set();
    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) {
        const a = valid[i];
        const b = valid[j];
        if (coordKey(a.target.x, a.target.y) === originByUnit.get(b.unit.id) &&
            coordKey(b.target.x, b.target.y) === originByUnit.get(a.unit.id)) {
          rejectedSwapIds.add(a.unit.id);
          rejectedSwapIds.add(b.unit.id);
        }
      }
    }

    for (const intent of valid) {
      if (rejectedSwapIds.has(intent.unit.id)) {
        logLine(`${teamWord(intent.unit.team)} ${ARCHETYPES[intent.unit.type].label} swap collision: movement cancelled.`, 'system');
        continue;
      }
      intent.unit.x = intent.target.x;
      intent.unit.y = intent.target.y;
      const verb = intent.ability ? ARCHETYPES[intent.unit.type].ability : 'MOVE';
      logLine(`${teamWord(intent.unit.team)} ${ARCHETYPES[intent.unit.type].label} ${verb} → ${gridName(intent.unit.x, intent.unit.y)}.`, intent.unit.team);
    }
  }

  function getReachableForResolution(unit, maxSteps, movingIds) {
    const start = coordKey(unit.x, unit.y);
    const visited = new Map([[start, 0]]);
    const queue = [{ x: unit.x, y: unit.y }];
    const dirs = [
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 }
    ];

    while (queue.length) {
      const cur = queue.shift();
      const steps = visited.get(coordKey(cur.x, cur.y));
      if (steps >= maxSteps) continue;
      for (const d of dirs) {
        const nx = cur.x + d.x;
        const ny = cur.y + d.y;
        const key = coordKey(nx, ny);
        if (!inBounds(nx, ny) || isWall(nx, ny) || visited.has(key)) continue;
        const occ = unitAt(nx, ny, unit.id);
        if (occ && !movingIds.has(occ.id)) continue;
        visited.set(key, steps + 1);
        queue.push({ x: nx, y: ny });
      }
    }
    visited.delete(start);
    return new Set(visited.keys());
  }

  function addDamage(map, targetId, amount, attacker, source) {
    const packet = map.get(targetId) || { total: 0, hits: [] };
    packet.total += amount;
    packet.hits.push({ amount, attackerId: attacker.id, source });
    map.set(targetId, packet);
    logLine(`${teamWord(attacker.team)} ${ARCHETYPES[attacker.type].label} ${source} connects for ${amount}.`, attacker.team);
  }

  function scoreControlNodes() {
    let p = 0;
    let c = 0;
    for (const node of CONTROL_NODES) {
      const occupant = unitAt(node.x, node.y);
      if (!occupant) continue;
      if (occupant.team === TEAM.PLAYER) p += 1;
      else c += 1;
    }
    if (p) {
      state.player.score += p;
      logLine(`YOU control ${p} node${p === 1 ? '' : 's'}: +${p}.`, 'score');
    }
    if (c) {
      state.cpu.score += c;
      logLine(`CPU controls ${c} node${c === 1 ? '' : 's'}: +${c}.`, 'score');
    }
  }

  function checkVictory() {
    const players = livingUnits(TEAM.PLAYER).length;
    const cpus = livingUnits(TEAM.CPU).length;
    let winner = null;
    let reason = '';

    if (players === 0 && cpus === 0) {
      if (state.player.score > state.cpu.score) winner = TEAM.PLAYER;
      else if (state.cpu.score > state.player.score) winner = TEAM.CPU;
      else winner = 'draw';
      reason = 'Both squads were eliminated simultaneously. Control score breaks the tie.';
    } else if (cpus === 0) {
      winner = TEAM.PLAYER;
      reason = 'Enemy squad eliminated.';
    } else if (players === 0) {
      winner = TEAM.CPU;
      reason = 'Your squad was eliminated.';
    } else if (state.player.score >= CONTROL_TARGET || state.cpu.score >= CONTROL_TARGET) {
      if (state.player.score > state.cpu.score) winner = TEAM.PLAYER;
      else if (state.cpu.score > state.player.score) winner = TEAM.CPU;
      else winner = 'draw';
      reason = `Control threshold reached: ${state.player.score}–${state.cpu.score}.`;
    }

    if (winner) finishGame(winner, reason);
  }

  function finishGame(winner, reason) {
    state.gameOver = true;
    state.phase = 'complete';
    const title = winner === TEAM.PLAYER ? 'VICTORY' : winner === TEAM.CPU ? 'DEFEAT' : 'DRAW';
    document.getElementById('resultTitle').textContent = title;
    document.getElementById('resultReason').textContent = reason;
    document.getElementById('resultOverlay').classList.remove('hidden');
    logLine(`${title}: ${reason}`, 'turn');
  }

  function advanceTurn() {
    state.turn += 1;
    state.phase = 'planning';
    state.playerOrders.clear();
    state.player.energy = Math.min(ENERGY_CAP, state.player.energy + ENERGY_INCOME);
    state.cpu.energy = Math.min(ENERGY_CAP, state.cpu.energy + ENERGY_INCOME);
    state.selectedAction = null;
    if (!unitById(state.selectedId)?.alive) state.selectedId = livingUnits(TEAM.PLAYER)[0]?.id || null;
    setHint(`Turn ${state.turn}. +${ENERGY_INCOME} Energy. Bank cap: ${ENERGY_CAP}.`);
    logLine(`TURN ${state.turn} — planning.`, 'turn');
  }

  function teamWord(team) { return team === TEAM.PLAYER ? 'YOU' : 'CPU'; }

  function setHint(text) {
    document.getElementById('boardHint').textContent = text;
  }

  function logLine(text, type = 'system') {
    state.log.push({ text, type });
    if (state.log.length > 80) state.log.shift();
    renderLog();
  }

  function renderLog() {
    const el = document.getElementById('eventLog');
    if (!el || !state) return;
    el.innerHTML = state.log.map(line => `<div class="log-line ${line.type}">${escapeHtml(line.text)}</div>`).join('');
    el.scrollTop = el.scrollHeight;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function describeOrder(unit, order) {
    if (!order) return 'UNASSIGNED';
    const a = ARCHETYPES[unit.type];
    if (order.type === 'hold') return 'HOLD';
    if (order.type === 'guard') return 'GUARD';
    if (order.type === 'move') return `MOVE → ${gridName(order.target.x, order.target.y)}`;
    if (order.type === 'attack') {
      const target = unitById(order.targetId);
      return `ATTACK → ${target ? ARCHETYPES[target.type].label : 'LOST TARGET'}`;
    }
    if (order.type === 'ability') {
      if (a.abilityType === 'move') return `${a.ability} → ${gridName(order.target.x, order.target.y)}`;
      const target = unitById(order.targetId);
      return `${a.ability} → ${target ? ARCHETYPES[target.type].label : 'LOST TARGET'}`;
    }
    return order.type.toUpperCase();
  }

  function updateUI() {
    if (!state) return;
    document.getElementById('turnLabel').textContent = `TURN ${state.turn}`;
    document.getElementById('phaseLabel').textContent = state.phase.toUpperCase();
    document.getElementById('playerScore').textContent = state.player.score;
    document.getElementById('cpuScore').textContent = state.cpu.score;
    document.getElementById('playerEnergy').textContent = `${state.player.energy} EN`;
    document.getElementById('cpuEnergy').textContent = `${state.cpu.energy} EN`;

    const unit = selectedUnit();
    const unitName = document.getElementById('unitName');
    const unitStats = document.getElementById('unitStats');
    const abilityText = document.getElementById('abilityText');

    if (unit && unit.alive) {
      const a = ARCHETYPES[unit.type];
      unitName.textContent = a.label;
      unitStats.classList.remove('muted');
      unitStats.textContent = `${unit.hp}/${a.maxHp} HP · MOVE ${a.move} · ATK ${a.attackDamage} · RANGE ${a.attackRange}`;
      abilityText.textContent = `${a.ability}: ${a.abilityDescription} ${unit.cooldown ? `READY IN ${unit.cooldown}` : 'READY'}`;
    } else {
      unitName.textContent = 'NONE';
      unitStats.classList.add('muted');
      unitStats.textContent = 'Choose one of your units.';
      abilityText.textContent = '';
    }

    document.querySelectorAll('.action-btn').forEach(btn => {
      const action = btn.dataset.action;
      btn.classList.toggle('active', state.selectedAction === action);
      let disabled = state.phase !== 'planning' || !unit || !unit.alive;
      if (!disabled && action === 'ability' && unit.cooldown > 0) disabled = true;
      if (!disabled) {
        const previous = state.playerOrders.get(unit.id);
        const available = state.player.energy + orderCost(previous);
        disabled = available < COST[action];
      }
      btn.disabled = disabled;
    });

    const list = document.getElementById('planList');
    const playerUnits = state.units.filter(u => u.team === TEAM.PLAYER);
    list.innerHTML = playerUnits.map(u => {
      const a = ARCHETYPES[u.type];
      const order = state.playerOrders.get(u.id);
      const status = !u.alive ? 'ELIMINATED' : describeOrder(u, order);
      const cost = order ? orderCost(order) : 0;
      return `<div class="plan-row"><strong>${a.label}</strong><span>${status}</span><em>${order ? `${cost} EN` : '—'}</em></div>`;
    }).join('');

    document.getElementById('executeBtn').disabled = state.phase !== 'planning' || state.gameOver;
    document.getElementById('clearPlanBtn').disabled = state.phase !== 'planning' || state.playerOrders.size === 0;
    renderLog();
  }

  function draw() {
    if (!state) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBoard();
    drawHighlights();
    drawNodes();
    drawWalls();
    drawUnits();
  }

  function drawBoard() {
    ctx.fillStyle = '#0a1118';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#0f1821' : '#101a24';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        ctx.strokeStyle = 'rgba(130, 155, 176, .09)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x * CELL + .5, y * CELL + .5, CELL - 1, CELL - 1);
      }
    }

    ctx.fillStyle = 'rgba(57,212,255,.025)';
    ctx.fillRect(0, 0, CELL * 3, canvas.height);
    ctx.fillStyle = 'rgba(255,138,61,.025)';
    ctx.fillRect(CELL * 8, 0, CELL * 3, canvas.height);
  }

  function drawHighlights() {
    if (state.phase !== 'planning') return;
    const unit = selectedUnit();
    if (!unit || !unit.alive) return;
    const a = ARCHETYPES[unit.type];

    const order = state.playerOrders.get(unit.id);
    if (order && (order.type === 'move' || (order.type === 'ability' && a.abilityType === 'move'))) {
      const target = order.target;
      ctx.fillStyle = 'rgba(57,212,255,.18)';
      ctx.fillRect(target.x * CELL + 4, target.y * CELL + 4, CELL - 8, CELL - 8);
    }

    if (state.selectedAction === 'move' || (state.selectedAction === 'ability' && a.abilityType === 'move')) {
      const range = state.selectedAction === 'move' ? a.move : a.abilityMove;
      const cells = getReachable(unit, range);
      ctx.fillStyle = state.selectedAction === 'move' ? 'rgba(57,212,255,.10)' : 'rgba(217,231,108,.11)';
      for (const key of cells) {
        const [x, y] = key.split(',').map(Number);
        ctx.fillRect(x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6);
      }
    }

    if (state.selectedAction === 'attack' || (state.selectedAction === 'ability' && a.abilityType === 'damage')) {
      const range = state.selectedAction === 'attack' ? a.attackRange : a.abilityRange;
      for (const enemy of livingUnits(TEAM.CPU)) {
        if (!canTarget(unit, enemy, range)) continue;
        ctx.strokeStyle = state.selectedAction === 'attack' ? 'rgba(255,94,104,.85)' : 'rgba(217,231,108,.9)';
        ctx.lineWidth = 3;
        ctx.strokeRect(enemy.x * CELL + 5, enemy.y * CELL + 5, CELL - 10, CELL - 10);
      }
    }

    ctx.strokeStyle = '#39d4ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(unit.x * CELL + 2, unit.y * CELL + 2, CELL - 4, CELL - 4);
  }

  function drawNodes() {
    for (const node of CONTROL_NODES) {
      const cx = node.x * CELL + CELL / 2;
      const cy = node.y * CELL + CELL / 2;
      const occupant = unitAt(node.x, node.y);
      const color = occupant?.team === TEAM.PLAYER ? '#39d4ff' : occupant?.team === TEAM.CPU ? '#ff8a3d' : '#d9e76c';
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(cx, cy, 23, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.globalAlpha = .12;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawWalls() {
    for (const key of WALLS) {
      const [x, y] = key.split(',').map(Number);
      const px = x * CELL;
      const py = y * CELL;
      ctx.fillStyle = '#293744';
      ctx.fillRect(px + 8, py + 7, CELL - 16, CELL - 14);
      ctx.strokeStyle = '#455665';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 8.5, py + 7.5, CELL - 17, CELL - 15);
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(px + 13, py + 12, CELL - 26, 3);
    }
  }

  function drawUnits() {
    for (const unit of state.units) {
      if (!unit.alive) continue;
      const a = ARCHETYPES[unit.type];
      const cx = unit.x * CELL + CELL / 2;
      const cy = unit.y * CELL + CELL / 2;
      const player = unit.team === TEAM.PLAYER;
      const color = player ? '#39d4ff' : '#ff8a3d';

      ctx.save();
      ctx.fillStyle = player ? 'rgba(57,212,255,.15)' : 'rgba(255,138,61,.15)';
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = '900 18px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.glyph, cx, cy - 1);

      const hpPct = unit.hp / a.maxHp;
      ctx.fillStyle = '#05080b';
      ctx.fillRect(cx - 24, cy + 25, 48, 5);
      ctx.fillStyle = hpPct > .5 ? '#76e2a4' : hpPct > .25 ? '#d9e76c' : '#ff5e68';
      ctx.fillRect(cx - 24, cy + 25, 48 * hpPct, 5);

      if (unit.cooldown > 0) {
        ctx.fillStyle = '#0b1118';
        ctx.fillRect(cx + 13, cy - 27, 15, 15);
        ctx.fillStyle = '#a9b7c3';
        ctx.font = '800 10px system-ui';
        ctx.fillText(String(unit.cooldown), cx + 20.5, cy - 19.5);
      }

      if (unit.shield > 0) {
        ctx.strokeStyle = '#d9e76c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 27, Math.PI * .15, Math.PI * .85);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  canvas.addEventListener('click', handleBoardClick);
  document.querySelectorAll('.action-btn').forEach(btn => btn.addEventListener('click', () => chooseAction(btn.dataset.action)));
  document.getElementById('clearPlanBtn').addEventListener('click', clearPlayerPlan);
  document.getElementById('executeBtn').addEventListener('click', executeTurn);
  document.getElementById('restartBtn').addEventListener('click', resetGame);

  document.addEventListener('keydown', evt => {
    if (evt.key === 'Enter' && state.phase === 'planning') executeTurn();
    if (evt.key === 'Escape' && state.phase === 'planning') {
      state.selectedAction = null;
      setHint('Targeting cancelled.');
      updateUI();
      draw();
    }
    const keyMap = { '1': 'move', '2': 'attack', '3': 'guard', '4': 'ability', '5': 'hold' };
    if (keyMap[evt.key] && state.phase === 'planning') chooseAction(keyMap[evt.key]);
  });

  resetGame();
})();
