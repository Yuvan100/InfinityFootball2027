(() => {
  'use strict';

  const W = 1100, H = 660;
  const FIELD = { left: 62, right: 1038, top: 62, bottom: 598, mid: 550, goalTop: 267, goalBottom: 393 };
  const KITS = [
    { name: 'NOVA', primary: '#ff6b65', dark: '#bc373c', accent: '#fff2dc', label: 'Coral / White' },
    { name: 'BLAZE', primary: '#f9b74c', dark: '#b66a28', accent: '#fff8e6', label: 'Gold / White' },
    { name: 'TIDES', primary: '#51cfc2', dark: '#188b8d', accent: '#f5fff1', label: 'Teal / White' }
  ];
  const CPU_KIT = { name: 'COMETS', primary: '#ffe073', dark: '#b98a2d', accent: '#253a43' };
  const $ = id => document.getElementById(id);
  const canvas = $('pitch'), ctx = canvas.getContext('2d');
  const screen = $('screen'), toast = $('toast'), mobileControls = $('mobileControls');
  const keys = new Set();
  const touch = { x: 0, y: 0, sprint: false, shoot: false };
  let kitIndex = 0, phase = 'start', half = 1, elapsed = 0, scores = [0, 0];
  let players = [], selected = null, ball = null, lastTime = 0, shotCharge = 0;
  let muted = false, audio = null, toastTime = 0, goalDelay = 0, pendingKickoff = 0;
  let crowdPulse = 0;

  function audioContext() {
    if (muted) return null;
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); return audio; }
    catch { return null; }
  }
  function beep(freq, duration, type = 'sine', volume = .08, endFreq = freq) {
    const a = audioContext(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t + duration);
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + duration);
  }
  function kickSound(power = 1) { beep(100 + power * 70, .13, 'triangle', .11, 55); }
  function whistle() { beep(850, .12, 'sine', .08); setTimeout(() => beep(1100, .23, 'sine', .07), 150); }
  function goalSound() { [0, 130, 260, 390].forEach((delay, i) => setTimeout(() => beep([420, 520, 650, 850][i], .24, 'triangle', .09), delay)); }

  function makePlayer(team, role, x, y, number) {
    return { team, role, x, y, homeX: x, homeY: y, number, vx: 0, vy: 0, faceX: team === 0 ? 1 : -1, faceY: 0,
      speed: role === 'gk' ? 145 : 202, radius: role === 'gk' ? 19 : 17, tackleCooldown: 0, aiCooldown: .5 + Math.random(), steps: 0 };
  }
  function setupTeams(kickoffTeam = 0) {
    players = [
      makePlayer(0, 'gk', 115, 330, 1), makePlayer(0, 'def', 300, 205, 4), makePlayer(0, 'def', 300, 455, 5),
      makePlayer(0, 'mid', 475, 330, 8), makePlayer(0, 'att', 425, 180, 9),
      makePlayer(1, 'gk', 985, 330, 1), makePlayer(1, 'def', 800, 200, 3), makePlayer(1, 'def', 800, 460, 6),
      makePlayer(1, 'mid', 625, 330, 8), makePlayer(1, 'att', 685, 180, 10)
    ];
    selected = players[3];
    if (kickoffTeam === 0) { players[3].x = 526; players[3].y = 330; players[8].x = 615; }
    else { players[8].x = 574; players[8].y = 330; players[3].x = 475; }
    ball = { x: 550, y: 330, vx: 0, vy: 0, owner: players[kickoffTeam === 0 ? 3 : 8], lock: 0, lastTeam: kickoffTeam, trail: [] };
    shotCharge = 0;
  }
  function setScreen(html, klass = '') { screen.className = 'screen ' + klass; screen.innerHTML = html; screen.classList.remove('hidden'); }
  function hideScreen() { screen.classList.add('hidden'); }
  function showStart() {
    phase = 'start'; $('pauseBtn').classList.add('hidden'); mobileControls.classList.add('hidden');
    setScreen('<div class="screen-content start-content"><div class="eyebrow">QUICK MATCH · 5-A-SIDE</div><h1>Make every<br><em>move count.</em></h1><p>Find the pass. Beat the press. Bend one into the corner.</p><button id="playBtn" class="primary-btn" type="button">PLAY MATCH <span aria-hidden="true">↗</span></button><div class="start-controls"><span><b>MOVE</b> WASD / ARROWS</span><span><b>PASS</b> J / SPACE</span><span><b>SHOOT</b> K</span><span><b>SPRINT</b> SHIFT</span></div></div><div class="start-stamp">YOUR PITCH.<br>YOUR MOMENT.</div>', 'start-screen');
    $('playBtn').onclick = showSelection;
  }
  function showSelection() {
    phase = 'select';
    setScreen('<div class="screen-content selection"><div class="eyebrow">STEP ONTO THE PITCH</div><h1>Choose your colors.</h1><div class="team-options">' + KITS.map((k, i) => '<button class="team-option ' + (i === kitIndex ? 'selected' : '') + '" data-kit="' + i + '" type="button"><span class="kit" style="background:' + k.primary + '"></span><strong>' + k.name + '</strong><small>' + k.label + '</small></button>').join('') + '</div><button id="startMatch" class="primary-btn" type="button">KICK OFF <span aria-hidden="true">↗</span></button><button id="backBtn" class="secondary-btn" type="button">BACK</button></div>', 'selection-screen');
    screen.querySelectorAll('[data-kit]').forEach(el => el.onclick = () => { kitIndex = Number(el.dataset.kit); showSelection(); });
    $('startMatch').onclick = startMatch; $('backBtn').onclick = showStart;
  }
  function startMatch() {
    audioContext(); scores = [0, 0]; elapsed = 0; half = 1; phase = 'playing'; setupTeams(0); hideScreen(); updateHud();
    $('pauseBtn').classList.remove('hidden'); updateMobileControls(); whistle(); showToast('KICK OFF', 1.3);
  }
  function halfTime() {
    phase = 'halftime'; elapsed = 45; whistle(); updateHud(); mobileControls.classList.add('hidden');
    setScreen('<div class="screen-content result"><div class="eyebrow">45 MINUTES DOWN</div><h1>Half-time.</h1><div class="scoreline">' + scores[0] + '<span>:</span>' + scores[1] + '</div><p>The second half is waiting. The Comets are picking up the pace.</p><button id="continueBtn" class="primary-btn" type="button">SECOND HALF <span aria-hidden="true">↗</span></button></div>', 'result-screen');
    $('continueBtn').onclick = () => { half = 2; phase = 'playing'; setupTeams(1); hideScreen(); updateHud(); updateMobileControls(); whistle(); showToast('SECOND HALF', 1.3); };
  }
  function fullTime() {
    phase = 'fulltime'; elapsed = 90; whistle(); updateHud(); mobileControls.classList.add('hidden'); $('pauseBtn').classList.add('hidden');
    const title = scores[0] > scores[1] ? 'Victory!' : scores[0] < scores[1] ? 'Full-time defeat.' : 'A hard-fought draw.';
    const line = scores[0] > scores[1] ? 'A performance for the highlight reel.' : scores[0] < scores[1] ? 'Every match is another shot at glory.' : 'Nothing between these two sides today.';
    setScreen('<div class="screen-content result"><div class="eyebrow">FULL-TIME · ' + KITS[kitIndex].name + ' VS COMETS</div><h1>' + title + '</h1><div class="scoreline">' + scores[0] + '<span>:</span>' + scores[1] + '</div><p>' + line + '</p><button id="againBtn" class="primary-btn" type="button">NEW MATCH <span aria-hidden="true">↗</span></button><button id="teamsBtn" class="secondary-btn" type="button">CHANGE TEAM</button></div>', 'result-screen');
    $('againBtn').onclick = startMatch; $('teamsBtn').onclick = showSelection;
  }
  function togglePause() {
    if (phase === 'playing') {
      phase = 'paused'; mobileControls.classList.add('hidden');
      setScreen('<div class="screen-content result"><div class="eyebrow">TAKE A BREATHER</div><h1>Paused.</h1><p>Ready when you are.</p><button id="resumeBtn" class="primary-btn" type="button">RESUME <span aria-hidden="true">↗</span></button><button id="quitBtn" class="secondary-btn" type="button">NEW MATCH</button></div>', 'result-screen');
      $('resumeBtn').onclick = togglePause; $('quitBtn').onclick = showSelection;
    } else if (phase === 'paused') { phase = 'playing'; hideScreen(); updateMobileControls(); }
  }
  function updateHud() {
    $('homeName').textContent = KITS[kitIndex].name; $('homeDot').style.background = KITS[kitIndex].primary;
    $('homeScore').textContent = scores[0]; $('awayScore').textContent = scores[1];
    $('period').textContent = phase === 'fulltime' ? 'FULL TIME' : half === 1 ? '1ST HALF' : '2ND HALF';
    const min = Math.min(90, Math.floor(elapsed)); const sec = Math.floor((elapsed % 1) * 60);
    $('clock').textContent = String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }
  function updateMobileControls() {
    const mobile = matchMedia('(pointer: coarse)').matches || innerWidth <= 700;
    mobileControls.classList.toggle('hidden', !(mobile && phase === 'playing'));
  }
  function showToast(message, seconds = 1) { toast.textContent = message; toast.classList.add('show'); toastTime = seconds; }
  function clearToast(dt) { if (toastTime > 0) { toastTime -= dt; if (toastTime <= 0) toast.classList.remove('show'); } }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function normalize(x, y) { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; }

  function choosePassTarget(owner) {
    const mates = players.filter(p => p.team === owner.team && p !== owner && p.role !== 'gk');
    const forward = owner.team === 0 ? 1 : -1;
    const aim = normalize(owner.faceX || forward, owner.faceY);
    mates.sort((a, b) => {
      const score = p => { const dx = p.x - owner.x, dy = p.y - owner.y, d = Math.hypot(dx, dy) || 1; return (dx * aim.x + dy * aim.y) / d * 170 + forward * dx * .14 - d * .42; };
      return score(b) - score(a);
    });
    return mates[0];
  }
  function kick(owner, type, charge = 0) {
    if (ball.owner !== owner) return;
    const dir = owner.team === 0 ? 1 : -1;
    let vx, vy;
    if (type === 'pass') {
      const target = choosePassTarget(owner);
      const lead = target ? { x: target.x + target.vx * .22, y: target.y + target.vy * .22 } : { x: owner.x + dir * 200, y: owner.y };
      const n = normalize(lead.x - owner.x, lead.y - owner.y);
      vx = n.x * 520; vy = n.y * 520; kickSound(.5);
    } else {
      const targetY = clamp(owner.y + owner.faceY * 75, FIELD.goalTop + 16, FIELD.goalBottom - 16);
      const goalX = owner.team === 0 ? FIELD.right + 20 : FIELD.left - 20;
      const n = normalize(goalX - owner.x, targetY - owner.y);
      const power = 610 + clamp(charge, 0, 1) * 440;
      vx = n.x * power; vy = n.y * power; kickSound(1.2);
    }
    ball.x = owner.x + owner.faceX * (owner.radius + 11); ball.y = owner.y + owner.faceY * (owner.radius + 11);
    ball.owner = null; ball.vx = vx; ball.vy = vy; ball.lock = .22; ball.lastTeam = owner.team;
    owner.aiCooldown = .6;
  }
  function passAction() {
    if (phase !== 'playing' || goalDelay > 0) return;
    if (ball.owner?.team === 0) { selected = ball.owner; kick(ball.owner, 'pass'); }
    else {
      const target = players.find(p => p.team === 1 && ball.owner === p);
      if (target && dist(selected, target) < 58 && selected.tackleCooldown <= 0) {
        selected.tackleCooldown = .55;
        if (Math.random() < .83) { steal(selected); kickSound(.2); showToast('NICE TACKLE', .6); }
      } else switchPlayer();
    }
  }
  function shootStart() { if (phase === 'playing') { keys.add('shoot'); shotCharge = 0; } }
  function shootEnd() {
    if (!keys.has('shoot')) return;
    keys.delete('shoot');
    if (phase === 'playing' && ball.owner?.team === 0) { selected = ball.owner; kick(ball.owner, 'shot', shotCharge); }
    shotCharge = 0;
  }
  function switchPlayer() {
    const field = players.filter(p => p.team === 0 && p.role !== 'gk');
    const candidate = field.filter(p => p !== selected).sort((a, b) => dist(a, ball) - dist(b, ball))[0];
    if (candidate) selected = candidate;
  }
  function steal(player) {
    ball.owner = player; ball.vx = ball.vy = 0; ball.lock = .35; ball.lastTeam = player.team;
    if (player.team === 0) selected = player;
  }
  function moveToward(p, tx, ty, dt, multiplier = 1) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    const speed = p.speed * multiplier;
    const desiredX = d > 7 ? dx / d * speed : 0, desiredY = d > 7 ? dy / d * speed : 0;
    const blend = Math.min(1, dt * 9);
    p.vx += (desiredX - p.vx) * blend; p.vy += (desiredY - p.vy) * blend;
    if (d > 15) { p.faceX = dx / d; p.faceY = dy / d; }
  }
  function controlPlayer(dt) {
    if (ball.owner?.team === 0 && selected !== ball.owner) selected = ball.owner;
    const x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + touch.x;
    const y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0) + touch.y;
    const n = normalize(x, y), mag = clamp(Math.hypot(x, y), 0, 1);
    const sprint = keys.has('shift') || touch.sprint;
    const speed = selected.speed * (sprint ? 1.43 : 1) * mag;
    const blend = Math.min(1, dt * 13);
    selected.vx += (n.x * speed - selected.vx) * blend;
    selected.vy += (n.y * speed - selected.vy) * blend;
    if (mag > .12) { selected.faceX = n.x; selected.faceY = n.y; }
    if (keys.has('shoot')) shotCharge = Math.min(1, shotCharge + dt / .85);
  }
  function aiForPlayer(p, dt) {
    const teamHasBall = ball.owner?.team === p.team;
    const theirGoalX = p.team === 0 ? FIELD.right : FIELD.left;
    const ownGoalX = p.team === 0 ? FIELD.left : FIELD.right;
    const difficulty = p.team === 1 ? 1 + elapsed * .0022 + (half === 2 ? .12 : 0) : 1;
    if (p.role === 'gk') {
      const keeperX = p.team === 0 ? 112 : 988;
      moveToward(p, keeperX, clamp(ball.y, 275, 385), dt, difficulty);
      if (ball.owner === p && p.aiCooldown <= 0) kick(p, 'pass');
      return;
    }
    if (ball.owner === p) {
      if (p.team === 1) {
        const goalDist = Math.abs(p.x - theirGoalX);
        const defenders = players.filter(q => q.team === 0 && q.role !== 'gk' && dist(p, q) < 95).length;
        const targetY = clamp(330 + (p.y - 330) * .28, 225, 435);
        moveToward(p, theirGoalX, targetY, dt, difficulty * .95);
        if (goalDist < 300 && p.aiCooldown <= 0) kick(p, 'shot', .45 + Math.random() * .45);
        else if (defenders >= 2 && p.aiCooldown <= 0 && Math.random() < dt * 4) kick(p, 'pass');
      } else moveToward(p, theirGoalX, clamp(p.y, 145, 515), dt, .9);
      return;
    }
    if (teamHasBall) {
      const owner = ball.owner;
      const forward = p.team === 0 ? 1 : -1;
      const lane = p.homeY < 330 ? -145 : p.homeY > 330 ? 145 : 0;
      moveToward(p, clamp(owner.x + forward * (p.role === 'att' ? 170 : 85), FIELD.left + 70, FIELD.right - 70), clamp(owner.y + lane, FIELD.top + 50, FIELD.bottom - 50), dt, difficulty * .9);
    } else {
      const candidates = players.filter(q => q.team === p.team && q.role !== 'gk' && q !== selected).sort((a, b) => dist(a, ball) - dist(b, ball));
      const chaser = candidates.indexOf(p) === 0 || (p.team === 1 && candidates.indexOf(p) === 1 && dist(p, ball) < 190);
      if (chaser) moveToward(p, ball.x, ball.y, dt, difficulty * 1.03);
      else {
        const defensiveShift = (ball.x - FIELD.mid) * .30;
        moveToward(p, clamp(p.homeX + defensiveShift, ownGoalX === FIELD.left ? 145 : 460, ownGoalX === FIELD.left ? 640 : 955), clamp(p.homeY + (ball.y - 330) * .18, 110, 550), dt, difficulty * .85);
      }
    }
  }
  function integratePlayers(dt) {
    for (const p of players) {
      p.tackleCooldown = Math.max(0, p.tackleCooldown - dt);
      p.aiCooldown = Math.max(0, p.aiCooldown - dt);
      if (p !== selected || p.team !== 0) aiForPlayer(p, dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.x = clamp(p.x, FIELD.left + p.radius, FIELD.right - p.radius);
      p.y = clamp(p.y, FIELD.top + p.radius, FIELD.bottom - p.radius);
      p.steps += Math.hypot(p.vx, p.vy) * dt * .045;
    }
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .001;
      const overlap = a.radius + b.radius + 2 - d;
      if (overlap > 0) {
        const nx = dx / d, ny = dy / d;
        a.x -= nx * overlap * .5; a.y -= ny * overlap * .5;
        b.x += nx * overlap * .5; b.y += ny * overlap * .5;
        if (a.team !== b.team && ball.owner && (ball.owner === a || ball.owner === b)) {
          const attacker = ball.owner === a ? b : a;
          if (attacker.tackleCooldown <= 0 && Math.random() < dt * (attacker.team === 1 ? 3.3 : 1.7)) {
            attacker.tackleCooldown = .6; steal(attacker); kickSound(.2);
          }
        }
      }
    }
  }
  function updateBall(dt) {
    ball.lock = Math.max(0, ball.lock - dt);
    if (ball.owner) {
      const p = ball.owner; ball.x = p.x + p.faceX * (p.radius + 13); ball.y = p.y + p.faceY * (p.radius + 13);
      ball.vx = p.vx; ball.vy = p.vy;
      if ((ball.x < FIELD.left + 4 || ball.x > FIELD.right - 4) && ball.y > FIELD.goalTop && ball.y < FIELD.goalBottom) {
        scoreGoal(ball.x > FIELD.mid ? 0 : 1); return;
      }
    } else {
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      const friction = Math.pow(.985, dt * 60); ball.vx *= friction; ball.vy *= friction;
      if (ball.y < FIELD.top + 7 || ball.y > FIELD.bottom - 7) { ball.y = clamp(ball.y, FIELD.top + 7, FIELD.bottom - 7); ball.vy *= -.65; }
      if (ball.x < FIELD.left + 4 || ball.x > FIELD.right - 4) {
        if (ball.y > FIELD.goalTop && ball.y < FIELD.goalBottom) { scoreGoal(ball.x > FIELD.mid ? 0 : 1); return; }
        ball.x = clamp(ball.x, FIELD.left + 4, FIELD.right - 4); ball.vx *= -.58;
      }
      if (ball.lock <= 0) {
        const speed = Math.hypot(ball.vx, ball.vy);
        const nearby = players.filter(p => dist(p, ball) < p.radius + 11).sort((a, b) => dist(a, ball) - dist(b, ball));
        for (const p of nearby) {
          if (speed > 660 && p.role !== 'gk') continue;
          steal(p); break;
        }
      }
    }
    ball.trail.unshift({ x: ball.x, y: ball.y }); if (ball.trail.length > 7) ball.trail.pop();
  }
  function scoreGoal(team) {
    if (goalDelay > 0) return;
    scores[team]++; updateHud(); goalSound(); showToast(team === 0 ? 'GOOOAL!' : 'COMETS SCORE', 1.8);
    goalDelay = 2.1; pendingKickoff = 1 - team; ball.vx = ball.vy = 0;
  }
  function update(dt) {
    crowdPulse += dt;
    clearToast(dt);
    if (phase !== 'playing') return;
    if (goalDelay > 0) {
      goalDelay -= dt;
      if (goalDelay <= 0) { setupTeams(pendingKickoff); whistle(); }
      return;
    }
    elapsed += dt;
    if (half === 1 && elapsed >= 45) { halfTime(); return; }
    if (elapsed >= 90) { fullTime(); return; }
    controlPlayer(dt); integratePlayers(dt); updateBall(dt); updateHud();
  }

  function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function circle(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (fill) ctx.fill(); else ctx.stroke(); }
  function drawPitch() {
    ctx.fillStyle = '#123e32'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#194a39'; ctx.fillRect(25, 27, 1050, 606);
    for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? '#27884f' : '#2b9255'; ctx.fillRect(FIELD.left + i * (FIELD.right - FIELD.left) / 10, FIELD.top, (FIELD.right - FIELD.left) / 10 + 1, FIELD.bottom - FIELD.top); }
    ctx.fillStyle = '#ffffff08'; for (let y = FIELD.top + 10; y < FIELD.bottom; y += 34) ctx.fillRect(FIELD.left, y, FIELD.right - FIELD.left, 1);
    ctx.strokeStyle = '#e6f7dbe8'; ctx.lineWidth = 3;
    ctx.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);
    line(FIELD.mid, FIELD.top, FIELD.mid, FIELD.bottom); circle(FIELD.mid, 330, 73, false); ctx.fillStyle = '#e6f7db'; circle(FIELD.mid, 330, 4, true);
    ctx.strokeRect(FIELD.left, 205, 134, 250); ctx.strokeRect(FIELD.right - 134, 205, 134, 250);
    ctx.strokeRect(FIELD.left, 265, 52, 130); ctx.strokeRect(FIELD.right - 52, 265, 52, 130);
    circle(155, 330, 4, true); circle(945, 330, 4, true);
    ctx.beginPath(); ctx.arc(155, 330, 57, -.86, .86); ctx.stroke();
    ctx.beginPath(); ctx.arc(945, 330, 57, Math.PI - .86, Math.PI + .86); ctx.stroke();
    ctx.fillStyle = '#ecf3e4'; ctx.fillRect(36, FIELD.goalTop, 26, FIELD.goalBottom - FIELD.goalTop); ctx.fillRect(FIELD.right, FIELD.goalTop, 26, FIELD.goalBottom - FIELD.goalTop);
    ctx.strokeStyle = '#7caa9a'; ctx.lineWidth = 1;
    for (let y = FIELD.goalTop + 12; y < FIELD.goalBottom; y += 12) { line(36, y, 62, y); line(FIELD.right, y, 1064, y); }
    for (let x = 36; x <= 62; x += 9) { line(x, FIELD.goalTop, x, FIELD.goalBottom); line(W - x, FIELD.goalTop, W - x, FIELD.goalBottom); }
    ctx.fillStyle = '#183c32'; ctx.fillRect(0, 0, W, 25); ctx.fillRect(0, H - 25, W, 25);
    for (let i = 0; i < 125; i++) { const x = (i * 89) % W, y = i % 2 ? 11 : H - 13; ctx.fillStyle = ['#ffda78', '#eaf0d7', '#ff7a6a', '#5fd5ba'][i % 4]; circle(x, y + Math.sin(crowdPulse * 2 + i) * 1.5, 2, true); }
  }
  function drawPlayer(p) {
    const kit = p.team === 0 ? KITS[kitIndex] : CPU_KIT;
    const active = p === selected && phase === 'playing';
    ctx.fillStyle = '#07332566'; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 10, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
    if (active) { ctx.strokeStyle = '#e8ff9e'; ctx.lineWidth = 4; circle(p.x, p.y, 25 + Math.sin(crowdPulse * 5) * 1.5, false); }
    const step = Math.sin(p.steps) * Math.min(4, Math.hypot(p.vx, p.vy) * .02);
    ctx.fillStyle = '#1a3030'; circle(p.x - 7 - p.faceY * step, p.y + 13, 5, true); circle(p.x + 7 + p.faceY * step, p.y + 13, 5, true);
    ctx.fillStyle = kit.dark; circle(p.x, p.y + 2, p.radius + 1, true);
    ctx.fillStyle = kit.primary; circle(p.x, p.y - 2, p.radius, true);
    ctx.strokeStyle = kit.accent; ctx.lineWidth = 3; line(p.x - 7, p.y - 10, p.x - 7, p.y + 7); line(p.x + 7, p.y - 10, p.x + 7, p.y + 7);
    ctx.fillStyle = kit.accent; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.number), p.x, p.y - 1);
    if (active && ball.owner === p && keys.has('shoot')) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 29, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * shotCharge); ctx.stroke();
    }
  }
  function drawBall() {
    if (!ball) return;
    ball.trail.forEach((pos, i) => { ctx.fillStyle = 'rgba(255,255,255,' + (.11 * (1 - i / 7)) + ')'; circle(pos.x, pos.y, Math.max(2, 8 - i), true); });
    ctx.fillStyle = '#09352777'; ctx.beginPath(); ctx.ellipse(ball.x + 3, ball.y + 6, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fffef0'; circle(ball.x, ball.y, 8, true); ctx.fillStyle = '#253936'; circle(ball.x, ball.y, 3, true);
    ctx.strokeStyle = '#253936'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ball.x, ball.y, 6, .6, 2.2); ctx.stroke();
  }
  function draw() {
    ctx.clearRect(0, 0, W, H); drawPitch();
    if (players.length) { players.filter(p => p !== selected).forEach(drawPlayer); if (selected) drawPlayer(selected); drawBall(); }
  }
  function frame(time) { const dt = Math.min(.033, (time - (lastTime || time)) / 1000); lastTime = time; update(dt); draw(); requestAnimationFrame(frame); }

  document.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (['arrowup','arrowdown','arrowleft','arrowright',' ','shift'].includes(key)) e.preventDefault();
    if (key === 'escape') { togglePause(); return; }
    if (phase !== 'playing' || e.repeat) { keys.add(key); return; }
    if (key === 'j' || key === ' ') passAction();
    else if (key === 'k') shootStart();
    else if (key === 'q') switchPlayer();
    keys.add(key);
  });
  document.addEventListener('keyup', e => { const key = e.key.toLowerCase(); if (key === 'k') shootEnd(); keys.delete(key); });
  window.addEventListener('blur', () => { keys.clear(); touch.x = touch.y = 0; touch.sprint = false; shootEnd(); });
  $('soundBtn').onclick = () => { muted = !muted; $('soundIcon').textContent = muted ? '♪̸' : '♪'; $('soundBtn').setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound'); $('soundBtn').title = muted ? 'Unmute sound' : 'Mute sound'; if (!muted) beep(520, .1); };
  $('pauseBtn').onclick = togglePause;
  $('playBtn').onclick = showSelection;

  const joystick = $('joystick'), stick = $('stick'); let stickPointer = null;
  function moveStick(e) {
    const r = joystick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const max = r.width * .33, dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy) || 1;
    touch.x = clamp(dx / max, -1, 1); touch.y = clamp(dy / max, -1, 1);
    const factor = Math.min(1, max / d); stick.style.left = 'calc(50% + ' + dx * factor + 'px)'; stick.style.top = 'calc(50% + ' + dy * factor + 'px)';
  }
  joystick.addEventListener('pointerdown', e => { stickPointer = e.pointerId; joystick.setPointerCapture(e.pointerId); moveStick(e); });
  joystick.addEventListener('pointermove', e => { if (e.pointerId === stickPointer) moveStick(e); });
  function releaseStick(e) { if (e.pointerId !== stickPointer) return; stickPointer = null; touch.x = touch.y = 0; stick.style.left = '50%'; stick.style.top = '50%'; }
  joystick.addEventListener('pointerup', releaseStick); joystick.addEventListener('pointercancel', releaseStick);
  $('passTouch').addEventListener('pointerdown', e => { e.preventDefault(); passAction(); });
  $('sprintTouch').addEventListener('pointerdown', e => { e.preventDefault(); touch.sprint = true; e.currentTarget.setPointerCapture(e.pointerId); });
  ['pointerup','pointercancel'].forEach(type => $('sprintTouch').addEventListener(type, () => touch.sprint = false));
  $('shootTouch').addEventListener('pointerdown', e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); shootStart(); });
  ['pointerup','pointercancel'].forEach(type => $('shootTouch').addEventListener(type, shootEnd));
  window.addEventListener('resize', updateMobileControls);

  setupTeams(0); updateHud(); requestAnimationFrame(frame);
})();
