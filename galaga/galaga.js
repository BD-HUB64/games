// 독고아재의 추억의 갤로그. 그림과 소리는 모두 직접 만든 도형·소리다.
// 조작: ← → 이동, 스페이스(꾹) 발사, P 멈춤, M 소리 끄기/켜기, Enter 시작.
'use strict';
const W = 480; let H = 640;
const BEST_KEY = 'galaga.phone.best';
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let state = 'title';            // title | play | pause | over
let stage, score, lives, best, nextLife;
let player = { x: W / 2, y: H - 70, alive: true }, bullets = [], ebullets = [], enemies = [], parts = [], stars;
let t = 0, diveT = 2, respawnT = 0, invuln = 0, fireCd = 0, overT = 0;
let banner = '', bannerT = 0, clearT = 0, sway = 0, spread = 1;
const keys = {};
let aim = null;                                   // 슬라이더가 가리키는 가로 위치 (없으면 null)
let cap = null, rescue = null, dual = false;   // 붙잡히는 중 / 구출되어 날아오는 기체 / 두 대 합체 상태
const DUAL_GAP = 18;                            // 합체했을 때 두 기체가 중심에서 떨어진 거리
const cx_ = () => dual ? [player.x - DUAL_GAP, player.x + DUAL_GAP] : [player.x];
// 발사 빠르기: 평소 1.2배. 오른쪽 위 '단계' 글씨를 두 번 빠르게 누르면 2배 ↔ 1.2배 (몰래 켜고 끄기, 게임 중에도 됨).
// 연사 간격이 줄고, 화면에 동시에 나가는 총알 수가 는다. 화면에는 표시하지 않고 소리로만 알린다. 앱을 다시 켜면 1.2배.
const FIRE_MULS = [1.2, 2];
let fireIdx = 0, tapT = 0;
const fireMul = () => FIRE_MULS[fireIdx];
function toggleFire() { fireIdx = 1 - fireIdx; sfx.pick(fireIdx ? 2 : 0); }
try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { best = 0; }
function saveBest() { if (score > best) { best = score; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* 저장 못 해도 계속 */ } } }

stars = Array.from({ length: 70 }, () => ({ x: rand(0, W), y: rand(0, H), v: rand(20, 90), s: rand(0.8, 2) }));

// ───────── 소리 (모두 직접 만든 합성음: 효과음 + 배경 음악) ─────────
let ac = null, master = null, musicBus = null, muted = false, musicOn = true, vol = 0.8, toastT = 0, toastMsg = '';
try { musicOn = localStorage.getItem('galaga.phone.music') !== '0'; const v = localStorage.getItem('galaga.phone.vol'); if (v !== null && Number(v) >= 0 && Number(v) <= 1) vol = Number(v); } catch (e) { /* 기본값 */ }
function toastShow(s) { toastMsg = s; toastT = 1.2; }
function setVol(v) {          // + - 키: 10%씩, 0~100%
  vol = Math.max(0, Math.min(1, Math.round(v * 10) / 10));
  if (master) master.gain.value = vol;
  try { localStorage.setItem('galaga.phone.vol', String(vol)); } catch (e) { /* 저장 못 해도 계속 */ }
  toastShow('음량 ' + Math.round(vol * 100) + '%'); audio(); if (vol > 0) sfx.pick(1);
}
function audio() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor(); comp.connect(ac.destination);   // 겹쳐도 찌그러지지 않게
      master = ac.createGain(); master.gain.value = vol; master.connect(comp);
      musicBus = ac.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master);
    }
    if (ac.state === 'suspended') ac.resume();
  } catch (e) { ac = null; }
  return ac;
}
// 한 음: 종류, 시작/끝 높이, 시작 시각, 길이, 크기, 보낼 곳, 저음 통과 필터, 서서히 커지는 시간
function voice(type, f0, f1, t, dur, vol, dest, lp, attack) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
  node.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + 0.02);
}
// 잡음(폭발·바람·북): 필터 높이를 f0에서 f1로 훑으며 줄어든다
function noiseBurst(t, dur, vol, f0, f1, type, dest) {
  const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = buf; f.type = type || 'lowpass';
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest || master); s.start(t); s.stop(t + dur + 0.02);
}
const A = fn => { if (muted || !audio()) return; fn(ac.currentTime); };
const sfx = {
  shoot: () => A(t => { voice('square', 880, 300, t, 0.08, 0.03); voice('sawtooth', 220, 110, t, 0.06, 0.02, null, 900); }),
  boom: () => A(t => { noiseBurst(t, 0.4, 0.22, 2000, 160, 'lowpass'); voice('sine', 160, 38, t, 0.35, 0.35); }),
  hit: () => A(t => { voice('square', 620, 460, t, 0.06, 0.04); voice('square', 930, 700, t, 0.05, 0.03); }),
  die: () => A(t => { noiseBurst(t, 1.0, 0.32, 1500, 70, 'lowpass'); voice('sine', 100, 24, t, 0.9, 0.5); voice('sawtooth', 320, 50, t, 0.8, 0.07, null, 1200); }),
  up: () => A(t => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => voice('triangle', f, f, t + i * 0.09, 0.25, 0.07))),
  over: () => A(t => [392, 329.63, 261.63, 196].forEach((f, i) => voice('sawtooth', f, f * 0.98, t + i * 0.38, 0.55, 0.07, null, 1400, 0.03))),
  pick: i => A(t => voice('triangle', 500 + i * 250, 500 + i * 250, t, 0.08, 0.05)),
  beam: () => A(t => { voice('sawtooth', 180, 900, t, 1.2, 0.05, null, 1600, 0.05); voice('sine', 360, 1800, t, 1.2, 0.04); }),
  capture: () => A(t => { voice('sine', 1000, 220, t, 1.3, 0.12); voice('sawtooth', 700, 120, t, 1.2, 0.05, null, 1200); noiseBurst(t, 1.0, 0.08, 4000, 300, 'bandpass'); }),
  merge: () => A(t => { [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => voice('triangle', f, f, t + i * 0.08, 0.35, 0.08)); voice('sawtooth', 130, 130, t, 0.7, 0.09, null, 700); noiseBurst(t, 0.5, 0.12, 6000, 800, 'highpass'); }),
  fanfare: () => A(t => {                      // 단계 시작: 올라가는 바람 + 겹쳐 쌓이는 화음 + 깊은 저음 + 심벌
    noiseBurst(t, 0.9, 0.12, 300, 5000, 'bandpass');
    [[220, 0], [277.18, 0.14], [329.63, 0.28], [440, 0.42]].forEach(([f, d]) => {
      voice('sawtooth', f, f, t + d, 1.1 - d * 0.6, 0.06, null, 1800, 0.03);
      voice('sawtooth', f * 2.005, f * 2.005, t + d, 1.1 - d * 0.6, 0.03, null, 2200, 0.03);
    });
    voice('sine', 110, 110, t + 0.45, 0.9, 0.14);
    noiseBurst(t + 0.45, 0.35, 0.18, 6000, 600, 'highpass');
  }),
};

// 배경 음악: 코드 4개(라·파·도·솔)를 도는 묵직한 저음 + 아르페지오 + 패드 + 북. 단계가 오르면 빨라진다.
const CHORDS = [[220, [0, 3, 7, 12]], [174.61, [0, 4, 7, 12]], [261.63, [0, 4, 7, 12]], [196, [0, 4, 7, 12]]];
const ARP = [0, 1, 2, 3, 2, 1, 2, 1];
let nextT = 0, mStep = 0;
function musicTick() {
  if (muted || !musicOn || state !== 'play' || !ac || ac.state !== 'running') { nextT = 0; return; }
  const bpm = 116 + Math.min(stage, 8) * 4, sd = 60 / bpm / 2, now = ac.currentTime;
  if (nextT < now - 0.05) nextT = now + 0.05;
  while (nextT < now + 0.2) { musicStep(nextT, sd); nextT += sd; mStep++; }
}
function musicStep(t, sd) {
  const pos = mStep % 8, [root, iv] = CHORDS[Math.floor(mStep / 8) % 4], B = musicBus;
  const bf = root / 2 * (pos === 3 || pos === 7 ? 2 : 1);
  voice('sawtooth', bf, bf, t, sd * 0.9, 0.11, B, 500);
  const af = root * 2 * Math.pow(2, iv[ARP[pos]] / 12);
  voice('square', af, af, t, sd * 0.8, 0.045, B, 2600);
  if (pos === 0) for (const s of [0, 7, 12]) { const f = root * Math.pow(2, s / 12); voice('triangle', f, f, t, sd * 8, 0.05, B, 1800, 0.25); }
  if (pos === 0 || pos === 4) voice('sine', 130, 45, t, 0.14, 0.2, B);
  if (pos === 2 || pos === 6) noiseBurst(t, 0.09, 0.07, 3000, 3000, 'highpass', B);
}

// ───────── 게임 만들기 ─────────
function startGame() {
  score = 0; lives = 3; stage = 1; nextLife = 20000;
  bullets = []; ebullets = []; parts = [];
  player = { x: W / 2, y: H - 70, alive: true };
  respawnT = 0; invuln = 0; overT = 0; fireCd = 0; clearT = 0;
  cap = null; rescue = null; dual = false; aim = null;
  spawnStage(); state = 'play';
}

function spawnStage() {
  enemies = [];
  // 줄 0: 대장 4마리, 줄 1·2: 나비 8마리씩, 줄 3·4: 벌 8마리씩. 아래 줄부터 날아 들어온다.
  const order = [4, 3, 1, 2, 0];
  order.forEach((row, g) => {
    const type = row === 0 ? 0 : row <= 2 ? 1 : 2;
    const cols = row === 0 ? [2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6, 7];
    const side = g % 2;
    cols.forEach((col, i) => {
      const sx = side ? W * 0.82 : W * 0.18;
      enemies.push({
        type, row, col, hp: type === 0 ? 2 : 1, state: 'wait', delay: g * 1.15 + i * 0.12, u: 0, hit: 0,
        x: -99, y: -99, fireT: rand(0.6, 1.4),
        p0: [sx, -30], p1: [sx, 400], p2: [W - sx, 400], d: null,
      });
    });
  });
  banner = 'STAGE ' + stage; bannerT = 1.6; diveT = 4 + 3; sfx.fanfare();
}

const slot = e => ({ x: W / 2 + (e.col - 3.5) * 42 * spread + sway, y: 100 + e.row * 38 });
function bez(u, a, b, c, d) {
  const m = 1 - u, f = (i) => m * m * m * a[i] + 3 * m * m * u * b[i] + 3 * m * u * u * c[i] + u * u * u * d[i];
  return { x: f(0), y: f(1) };
}

function boom(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), v = rand(30, speed);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.35, 0.8), max: 0.8, color });
  }
}
function addScore(n) {
  score += n;
  if (score >= nextLife) { lives++; nextLife += 70000; sfx.up(); banner = '보너스 기체!'; bannerT = 1.2; }
}
function killEnemy(e) {
  const diving = e.state === 'dive' || e.state === 'enter' || e.state === 'return' || e.state === 'beam';
  const base = [150, 80, 50][e.type];
  addScore(diving ? base * 2 : base);
  boom(e.x, e.y, ['#5fe08a', '#ff6b6b', '#ffd84a'][e.type], 16, 170); sfx.boom();
  if (cap && cap.e === e) {              // 끌려 올라가는 도중에 대장을 잡으면 풀려난다 (잃은 기체를 되돌려 받음)
    lives++; player.alive = true; player.x = clamp(cap.x, 22, W - 22); invuln = 1.6; respawnT = 0; cap = null;
    banner = '구출!'; bannerT = 1.2; sfx.up();
  }
  if (e.captive) {
    if (e.state === 'form') { rescue = { x: e.x, y: e.y - 30, t: 0 }; sfx.up(); }   // 편대 안에서 잡으면 구출
    else { boom(e.x, e.y - 30, '#ff6b6b', 18, 160); sfx.boom(); }                    // 날아다닐 때 잡으면 같이 터진다
    e.captive = false;
  }
  enemies.splice(enemies.indexOf(e), 1);
}
function hurtPlayer() {                  // 맞았을 때: 합체 중이면 한 대만 부서진다
  if (!player.alive) return;
  if (dual) {
    dual = false; invuln = 1.6; boom(player.x + DUAL_GAP, player.y, '#ff6b6b', 22, 190); boom(player.x + DUAL_GAP, player.y, '#ffffff', 14, 150);
    sfx.die(); ebullets = []; banner = '한 대 잃었다'; bannerT = 1.0;
  } else killPlayer();
}
function killPlayer() {
  if (!player.alive) return;
  player.alive = false; boom(player.x, player.y, '#ffffff', 30, 230); boom(player.x, player.y, '#ff6b6b', 20, 160); sfx.die();
  lives--; ebullets = [];
  if (lives <= 0) { overT = 2.2; saveBest(); setTimeout(sfx.over, 700); } else respawnT = 1.8;
}

// ───────── 갱신 ─────────
function update(dt) {
  t += dt; toastT = Math.max(0, toastT - dt);
  for (const s of stars) { s.y += s.v * dt; if (s.y > H) { s.y = 0; s.x = rand(0, W); } }
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.vx *= 0.98; p.vy *= 0.98; }
  parts = parts.filter(p => p.life > 0);
  if (state !== 'play') return;

  sway = Math.sin(t * 0.9) * 26; spread = 1 + 0.07 * Math.sin(t * 1.7);
  bannerT = Math.max(0, bannerT - dt);
  invuln = Math.max(0, invuln - dt);

  // 내 기체
  if (player.alive) {
    const dir = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0), edge = 22 + (dual ? DUAL_GAP : 0);
    if (dir) { aim = null; player.x = clamp(player.x + dir * 290 * dt, edge, W - edge); }
    else if (aim !== null) player.x = clamp(player.x + clamp(aim - player.x, -520 * dt, 520 * dt), edge, W - edge);   // 슬라이더가 가리키는 곳으로 따라간다
    fireCd -= dt;
    if ((keys[' '] || keys.z) && fireCd <= 0 && bullets.length < Math.round(3 * fireMul()) * (dual ? 2 : 1)) {
      for (const bx of cx_()) bullets.push({ x: bx, y: player.y - 20 });     // 합체하면 총알이 두 줄
      fireCd = 0.16 / fireMul(); sfx.shoot();
    }
  } else if (cap) {
    // 빛줄기에 끌려 올라가는 중: 대장 쪽으로 빙글빙글 올라간다
    cap.t += dt; const u = Math.min(1, cap.t / 1.5), e = cap.e;
    cap.x = cap.x0 + (e.x - cap.x0) * u; cap.y = cap.y0 + (e.y + 10 - cap.y0) * u;
    if (u >= 1) {                         // 붙잡힘 완료: 대장이 기체를 끼고 편대로 돌아간다
      e.captive = true; e.b = null; e.state = 'return'; boom(e.x, e.y, '#ff9a9a', 10, 90);
      banner = '기체를 빼앗겼다!'; bannerT = 1.6; respawnT = 1.2; cap = null;
    }
  } else if (lives > 0) {
    respawnT -= dt;
    if (respawnT <= 0) { player.alive = true; player.x = W / 2; invuln = 2.2; }
  } else {
    overT -= dt; if (overT <= 0) state = 'over';
  }
  for (const b of bullets) b.y -= 560 * dt;
  bullets = bullets.filter(b => b.y > -10);

  // 적
  const settled = enemies.every(e => e.state === 'form' || e.state === 'dive' || e.state === 'return');
  for (const e of enemies) {
    if (e.hit > 0) e.hit -= dt;
    if (e.state === 'wait') { e.delay -= dt; if (e.delay <= 0) { e.state = 'enter'; e.u = 0; } continue; }
    if (e.state === 'enter') {
      e.u += dt / 1.7;
      const s = slot(e);
      if (e.u >= 1) { e.state = 'form'; e.x = s.x; e.y = s.y; } else { const p = bez(e.u, e.p0, e.p1, e.p2, [s.x, s.y]); e.x = p.x; e.y = p.y; }
    } else if (e.state === 'form') {
      const s = slot(e); e.x = s.x; e.y = s.y;
      if (stage > 1 && ebullets.length < 3 && player.alive && Math.random() < dt * 0.05) shoot(e);
    } else if (e.state === 'dive') {
      const d = e.d; d.t += dt;
      if (d.t < 0.5) { e.y -= 70 * dt; e.x += d.dir * 150 * dt; }
      else {
        e.y += (170 + stage * 12) * dt;
        if (e.y < H * 0.72 && player.alive) e.x += clamp(player.x - e.x, -1, 1) * 110 * dt;
        e.x += Math.sin(d.t * 6) * 70 * dt;
      }
      e.x = clamp(e.x, 12, W - 12);
      e.fireT -= dt;
      if (e.fireT <= 0 && e.y < H * 0.62 && d.t > 0.7) { shoot(e); e.fireT = rand(0.9, 1.7); }
      if (e.y > H + 30) { e.state = 'return'; const s = slot(e); e.x = s.x; e.y = -30; }
    } else if (e.state === 'return') {
      const s = slot(e), dx = s.x - e.x, dy = s.y - e.y, dist = Math.hypot(dx, dy), step = 260 * dt;
      if (dist <= step) { e.state = 'form'; e.x = s.x; e.y = s.y; } else { e.x += dx / dist * step; e.y += dy / dist * step; }
    } else if (e.state === 'beam') {         // 대장의 빛줄기 공격: 내려와서 멈추고 빛줄기를 쏜다
      const b = e.b; b.t += dt;
      if (b.phase === 'down') {
        e.y += 170 * dt; e.x += clamp(player.x - e.x, -1, 1) * 60 * dt; e.x = clamp(e.x, 20, W - 20);
        if (e.y >= H * 0.5) { b.phase = 'on'; b.t = 0; sfx.beam(); }
      } else if (b.phase === 'on') {
        if (b.t > 2.6) { e.state = 'dive'; e.d = { t: 0.6, dir: e.x < W / 2 ? 1 : -1 }; e.fireT = rand(0.8, 1.2); e.b = null; }   // 놓쳤으면 그대로 아래로 빠져나간다
      }                                       // 'hold' 단계는 붙잡는 동안 제자리에서 기다린다
    }
  }
  // 급강하 시작
  diveT -= dt;
  if (diveT <= 0 && settled && player.alive) {
    const maxDive = Math.min(2 + Math.floor(stage / 2), 6);
    const divers = enemies.filter(e => e.state === 'dive').length;
    const pool = enemies.filter(e => e.state === 'form');
    if (divers < maxDive && pool.length) {
      const e = pool[Math.floor(Math.random() * pool.length)];
      // 대장은 여분 기체가 있고 합체 전이고 이미 붙잡힌 기체가 없을 때 가끔 빛줄기 공격을 한다
      const canBeam = e.type === 0 && !e.captive && !dual && lives >= 2 && player.alive && !cap && !rescue
        && !enemies.some(x => x.captive || x.state === 'beam') && Math.random() < 0.55;
      if (canBeam) { e.state = 'beam'; e.b = { t: 0, phase: 'down' }; }
      else { e.state = 'dive'; e.d = { t: 0, dir: e.x < W / 2 ? 1 : -1 }; e.fireT = rand(0.8, 1.2); }
    }
    diveT = Math.max(0.6, 2.2 - stage * 0.15) + rand(0, 0.8);
  }

  // 적 총알
  for (const b of ebullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
  ebullets = ebullets.filter(b => b.y < H + 10 && b.x > -10 && b.x < W + 10);

  // 맞았는지
  for (const b of bullets.slice()) {
    for (const e of enemies) {
      if (e.state === 'wait') continue;
      if (Math.abs(b.x - e.x) < 17 && Math.abs(b.y - e.y) < 17) {
        bullets.splice(bullets.indexOf(b), 1);
        if (--e.hp <= 0) killEnemy(e); else { e.hit = 0.18; sfx.hit(); addScore(10); }
        break;
      }
    }
  }
  if (player.alive && invuln <= 0) {
    const xs = cx_();
    for (const e of enemies.slice()) {
      if (e.state !== 'wait' && xs.some(x => Math.abs(e.x - x) < 20) && Math.abs(e.y - player.y) < 20) { killEnemy(e); hurtPlayer(); break; }
    }
    if (player.alive) for (const b of ebullets) {
      if (xs.some(x => Math.abs(b.x - x) < 11) && Math.abs(b.y - player.y) < 15) { hurtPlayer(); break; }
    }
    // 빛줄기에 들어오면 붙잡힌다 (합체 전, 여분 기체가 있을 때만)
    if (player.alive && !dual && lives >= 2 && !cap) {
      for (const e of enemies) {
        if (e.state !== 'beam' || e.b.phase !== 'on' || player.y <= e.y + 14) continue;
        const hw = 12 + (player.y - (e.y + 14)) * 0.30;
        if (Math.abs(player.x - e.x) < hw) {
          cap = { e, x0: player.x, y0: player.y, x: player.x, y: player.y, t: 0 };
          player.alive = false; respawnT = 99; lives--; ebullets = []; e.b.phase = 'hold'; sfx.capture();
          break;
        }
      }
    }
  }
  // 구출된 기체: 내 기체 쪽으로 날아와서 합체한다
  if (rescue) {
    rescue.t += dt;
    const tx = player.alive ? player.x : W / 2, ty = player.y, dx = tx - rescue.x, dy = ty - rescue.y, dist = Math.hypot(dx, dy), step = 230 * dt;
    if (dist > step) { rescue.x += dx / dist * step; rescue.y += dy / dist * step; }
    else if (player.alive) {
      rescue = null; dual = true; invuln = 1.2; player.x = clamp(player.x, 22 + DUAL_GAP, W - 22 - DUAL_GAP);
      addScore(1000); banner = '합체! 화력 2배'; bannerT = 1.8; sfx.merge();
    }
  }

  // 단계 끝
  if (enemies.length === 0 && state === 'play') {
    if (clearT === 0) { clearT = 2; banner = 'STAGE ' + stage + ' 클리어'; bannerT = 2; }
    clearT -= dt;
    if (clearT <= 0) { clearT = 0; stage++; spawnStage(); }
  }
}
function shoot(e) {
  if (ebullets.length >= 6 || !player.alive) return;
  const sp = 230 + stage * 10, dx = clamp((player.x - e.x) * 0.25, -70, 70);
  ebullets.push({ x: e.x, y: e.y + 12, vx: dx, vy: sp });
}

// ───────── 그리기 ─────────
function poly(pts, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fill();
}
function drawShip(x, y, scale, red, rot) {     // red: 붙잡힌 기체(붉은 색), rot: 돌리는 각도
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(scale, scale);
  poly([[-6, 0], [-18, 12], [-18, 18], [-6, 12]], red ? '#ffd0d0' : '#d23a3a'); poly([[6, 0], [18, 12], [18, 18], [6, 12]], red ? '#ffd0d0' : '#d23a3a');
  poly([[0, -20], [6, -4], [6, 12], [-6, 12], [-6, -4]], red ? '#e8453c' : '#e8ecf4');
  poly([[-3, -6], [3, -6], [3, 2], [-3, 2]], red ? '#ffffff' : '#3a6fd2');
  poly([[-5, 12], [5, 12], [2, 17], [-2, 17]], '#ffb347');
  ctx.restore();
}
function drawBeam(e) {                          // 대장이 쏘는 빛줄기 (넓어지는 부채꼴 + 아래로 흐르는 띠)
  const y0 = e.y + 14, y1 = H - 20, hw = y => 12 + (y - y0) * 0.30;
  ctx.save(); ctx.beginPath(); ctx.moveTo(e.x - 12, y0); ctx.lineTo(e.x + 12, y0); ctx.lineTo(e.x + hw(y1), y1); ctx.lineTo(e.x - hw(y1), y1); ctx.closePath();
  ctx.fillStyle = 'rgba(110,190,255,0.16)'; ctx.fill(); ctx.clip();
  for (let k = 0; k < 9; k++) {
    const y = y0 + ((t * 140 + k * 36) % (y1 - y0)), h = hw(y);
    ctx.strokeStyle = `rgba(170,225,255,${0.55 - (y - y0) / (y1 - y0) * 0.35})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(e.x - h, y); ctx.quadraticCurveTo(e.x, y + 10, e.x + h, y); ctx.stroke();
  }
  ctx.restore();
}
// ───────── 벌레 그리기: 남색 굵은 윤곽선 + 납작한 색 (파리 그림 스타일) ─────────
const OUT = '#1b1566';
function ell(x, y, rx, ry, rot, fill) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
}
function polyO(pts, fill) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
}
function legs(list) {
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const p of list) { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.stroke(); }
}
const mir = list => list.map(p => p.map(([x, y]) => [-x, y]));

function fly(flap, hit) {            // 벌 → 파리 모양 (주황 몸, 하늘색 날개)
  const L = [[[-4, -3], [-10, -7], [-10, -12]], [[-5, 1], [-13, 0]], [[-4, 5], [-10, 9], [-10, 14]]];
  legs(L); legs(mir(L));
  const wr = 0.45 + flap * 0.2, wing = hit ? '#fff' : '#6bbcff';
  ell(-8, 3, 4.6, 10.5, wr, wing); ell(8, 3, 4.6, 10.5, -wr, wing);
  ell(0, 2, 5.2, 10, 0, hit ? '#fff' : '#f7803c');
  ell(0, -8, 4.2, 3.8, 0, hit ? '#fff' : '#f7a23c');
  ell(-3.4, -9, 1.9, 2.2, 0, '#ffd27a'); ell(3.4, -9, 1.9, 2.2, 0, '#ffd27a');
}
function butterfly(flap, hit) {      // 나비 → 큰 분홍 날개, 더듬이
  const s = 0.78 + 0.22 * Math.abs(flap), up = hit ? '#fff' : '#ff6b81', low = hit ? '#fff' : '#4aa8ff';
  ctx.save(); ctx.scale(s, 1);
  ell(-9, -5, 8, 6, -0.5, up); ell(9, -5, 8, 6, 0.5, up);
  ell(-7, 6, 5.5, 4.5, 0.5, low); ell(7, 6, 5.5, 4.5, -0.5, low);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-10, -5, 1.7, 0, 7); ctx.arc(10, -5, 1.7, 0, 7); ctx.fill();
  ctx.restore();
  legs([[[-1.5, -11], [-4, -15], [-7, -16]], [[1.5, -11], [4, -15], [7, -16]]]);
  ell(0, 0, 2.6, 9.5, 0, '#2d2d78'); ell(0, -9, 3, 3, 0, '#2d2d78');
}
function beetle(flap, hit, hp) {     // 대장 → 뿔 달린 딱정벌레 (두 번 맞아야 함)
  const L = [[[-6, -5], [-13, -9], [-14, -14]], [[-7, 0], [-15, 0]], [[-6, 5], [-13, 10], [-14, 15]]];
  legs(L); legs(mir(L));
  const wr = 0.4 + flap * 0.12, wing = hit ? '#fff' : '#6bbcff';
  ell(-9, 4, 3.6, 9, wr, wing); ell(9, 4, 3.6, 9, -wr, wing);
  ell(0, 3, 9, 11.5, 0, hit ? '#fff' : hp >= 2 ? '#47c46b' : '#9a62d6');
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 14); ctx.stroke();
  polyO([[-4, -12], [-9, -20], [-1, -14]], hit ? '#fff' : '#ffd84a'); polyO([[4, -12], [9, -20], [1, -14]], hit ? '#fff' : '#ffd84a');
  ell(0, -10, 5.5, 4.5, 0, hit ? '#fff' : '#f7c13c');
  ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(-2.4, -10, 1.2, 0, 7); ctx.arc(2.4, -10, 1.2, 0, 7); ctx.fill();
}
function drawEnemy(e) {
  const flap = Math.sin(t * 22 + e.col * 1.3), hit = e.hit > 0;
  ctx.save(); ctx.translate(e.x, e.y);
  ctx.scale(1.2, 1.2);
  ctx.rotate(Math.PI);                                  // 머리가 아래(내 기체 쪽)를 본다
  if (e.state === 'dive') ctx.rotate(Math.sin(e.d.t * 6) * 0.25);
  if (e.type === 2) fly(flap, hit); else if (e.type === 1) butterfly(flap, hit); else beetle(flap, hit, e.hp);
  ctx.restore();
  if (e.captive) drawShip(e.x, e.y - 30, 0.8, true);       // 붙잡힌 내 기체는 대장 위에 붉게 붙어 있다
}
function text(s, x, y, size, color, align) {
  ctx.font = `bold ${size}px "Malgun Gothic","Apple SD Gothic Neo",sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function render() {
  ctx.fillStyle = '#050610'; ctx.fillRect(0, 0, W, H);
  for (const s of stars) { ctx.fillStyle = `rgba(200,215,255,${0.35 + s.s / 4})`; ctx.fillRect(s.x, s.y, s.s, s.s); }
  if (state !== 'title') {
    for (const e of enemies) if (e.state === 'beam' && (e.b.phase === 'on' || e.b.phase === 'hold')) drawBeam(e);
    for (const e of enemies) if (e.state !== 'wait') drawEnemy(e);
    ctx.fillStyle = '#9ff'; for (const b of bullets) ctx.fillRect(b.x - 2, b.y - 8, 4, 14);
    ctx.fillStyle = '#ff7a59'; for (const b of ebullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, 7); ctx.fill(); }
    if (player.alive && (invuln <= 0 || Math.floor(t * 12) % 2 === 0)) for (const sx of cx_()) drawShip(sx, player.y, 1);
    if (cap) drawShip(cap.x, cap.y, 1, true, cap.t * 7);                              // 끌려 올라가는 기체
    if (rescue) drawShip(rescue.x, rescue.y, 1, false, Math.sin(rescue.t * 8) * 0.5);  // 풀려나 날아오는 기체
  }
  for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
  ctx.globalAlpha = 1;
  // 위쪽 안내
  text('점수', 70, 18, 12, '#ff6b6b'); text(String(state === 'title' ? 0 : score), 70, 38, 20, '#fff');
  text('최고점', W / 2, 18, 12, '#ff6b6b'); text(String(Math.max(best, state === 'title' ? 0 : score)), W / 2, 38, 20, '#fff');
  text('단계', W - 70, 18, 12, '#ff6b6b'); text(String(state === 'title' ? 1 : stage), W - 70, 38, 20, '#fff');
  if (state !== 'title') {
    for (let i = 0; i < Math.max(0, lives - 1); i++) drawShip(26 + i * 30, H - 22, 0.6);
    text('음악 ' + (musicOn && !muted ? '켬' : '끔'), W - 10, H - 14, 13, '#789', 'right');
  }
  if (bannerT > 0 && state === 'play') text(banner, W / 2, H * 0.52, 30, '#7fe6ff');
  if (toastT > 0) { ctx.globalAlpha = Math.min(1, toastT * 2); text(toastMsg, W / 2, 74, 22, '#fff'); ctx.globalAlpha = 1; }
  ctx.save(); ctx.translate(0, (H - 640) / 2);
  if (state === 'title') {
    text('독고아재의', W / 2, 150, 22, '#ffd84a'); text('추억의 갤로그', W / 2, 200, 44, '#7fe6ff'); text('STAR SHOOTING', W / 2, 240, 15, '#ff6b6b');
    drawShip(W / 2, 320, 1.6);
    text('화면을 눌러 시작', W / 2, 430, 24, '#fff');
    text('◀ ▶  옮기기   ·   조준 단추(꾹)  쏘기', W / 2, 475, 15, '#9ab');
    text('이 줄을 누르면 음악 켜기/끄기', W / 2, 500, 15, '#9ab');
  } else if (state === 'pause') {
    ctx.fillStyle = 'rgba(5,6,16,.72)'; ctx.fillRect(0, -H, W, H * 3);
    text('멈춤', W / 2, 270, 40, '#fff'); text('화면을 눌러 계속하기', W / 2, 330, 22, '#7fe6ff');
  } else if (state === 'over') {
    ctx.fillStyle = 'rgba(5,6,16,.72)'; ctx.fillRect(0, -H, W, H * 3);
    text('게임 끝', W / 2, 250, 42, '#ff6b6b'); text('점수 ' + score + (score >= best && score > 0 ? '  · 최고점!' : ''), W / 2, 305, 22, '#fff');
    text('화면을 눌러 다시 하기', W / 2, 360, 20, '#7fe6ff');
  }
  ctx.restore();
}

// ───────── 반복과 입력 ─────────
let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
  musicTick(); update(dt); render(); syncThumb();
}
function resize() {
  const dpr = window.devicePixelRatio || 1, st = document.getElementById('stage');
  const aw = st.clientWidth || window.innerWidth, ah = st.clientHeight || window.innerHeight;
  H = clamp(Math.round(W * ah / aw), 640, 900);           // 폰이 길면 판도 길게 (빈 띠가 안 생기게)
  if (player) player.y = H - 70;
  const h = Math.min(ah, aw * H / W), w = h * W / H;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
}
function setPause(p) {
  if (p && state === 'play') state = 'pause';
  else if (!p && state === 'pause') state = 'play';
}
function toTitle() { saveBest(); state = 'title'; }
window.addEventListener('keydown', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
  keys[k] = true; audio();
  if (k === 'Enter') { if (state === 'title' || state === 'over') startGame(); else setPause(false); }
  else if (k === 'p') setPause(state === 'play');
  else if (k === 'Escape') { if (state === 'pause') toTitle(); else if (state === 'play') setPause(true); }
  else if (k === 'm') muted = !muted;
  else if (k === 'n') { musicOn = !musicOn; try { localStorage.setItem('galaga.phone.music', musicOn ? '1' : '0'); } catch (e) { /* 저장 못 해도 계속 */ } toastShow('음악 ' + (musicOn ? '켜짐' : '꺼짐')); }
  else if (k === '+' || k === '=') setVol(vol + 0.1);
  else if (k === '-' || k === '_') setVol(vol - 0.1);
});
window.addEventListener('keyup', e => { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; setPause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
cv.addEventListener('pointerdown', e => {
  audio();
  { // 오른쪽 위 '단계' 글씨: 0.4초 안에 두 번 누르면 발사 2배 ↔ 1.2배 (한 번만 누르면 아무 일도 없다)
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    if (x >= W - 120 && y <= 56) { const n = performance.now(); if (n - tapT < 400) { tapT = 0; toggleFire(); } else tapT = n; return; }
  }
  if (state === 'title') {
    const r = cv.getBoundingClientRect(), y = (e.clientY - r.top) / r.height * H - (H - 640) / 2;
    if (y >= 486 && y <= 514) { musicOn = !musicOn; try { localStorage.setItem('galaga.phone.music', musicOn ? '1' : '0'); } catch (e2) { /* 저장 못 해도 계속 */ } toastShow('음악 ' + (musicOn ? '켜짐' : '꺼짐')); return; }
  }
  if (state === 'title' || state === 'over') startGame(); else if (state === 'pause') setPause(false);
});
// ───────── 폰 터치 단추: ◀ ▶ 이동, 주황 단추 꾹 누르면 연사 (여러 손가락 동시에 가능) ─────────
const KEYMAP = { left: 'ArrowLeft', right: 'ArrowRight', fire: ' ' };
document.querySelectorAll('#pad > button[data-k]').forEach(b => {
  const k = KEYMAP[b.dataset.k], ids = new Set();
  const down = e => { e.preventDefault(); audio(); ids.add(e.pointerId); keys[k] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ } };
  const up = e => { ids.delete(e.pointerId); if (!ids.size) { keys[k] = false; b.classList.remove('on'); } };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  b.addEventListener('contextmenu', e => e.preventDefault());
});
const pauseBtn = document.getElementById('pause');
pauseBtn.addEventListener('click', () => { audio(); if (state === 'play') setPause(true); else if (state === 'pause') setPause(false); });
document.getElementById('quit').addEventListener('click', () => {
  if (state !== 'play' && state !== 'pause') return;
  const was = state; if (was === 'play') setPause(true);
  if (confirm('이번 판을 끝낼까요?')) toTitle(); else if (was === 'play') setPause(false);
});
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (window.ResizeObserver) new ResizeObserver(resize).observe(document.getElementById('stage'));
resize(); requestAnimationFrame(frame);

// ───────── 좌우 슬라이더: 둥근 손잡이를 밀면 기체가 그 위치로 따라간다 ─────────
const slider = document.getElementById('slider'), thumb = document.getElementById('thumb'), fillEl = document.getElementById('fill');
const sEdge = () => 22 + (dual ? DUAL_GAP : 0);
let sliding = null;
function syncThumb() {
  if (!slider) return;
  const tw = thumb.offsetWidth, span = slider.clientWidth - tw, e = sEdge();
  const f = clamp((player.x - e) / (W - 2 * e), 0, 1), x = f * span;
  thumb.style.transform = `translateX(${x}px)`; fillEl.style.width = (x + tw / 2) + 'px';
}
function slideTo(clientX) {
  const r = slider.getBoundingClientRect(), tw = thumb.offsetWidth, f = clamp((clientX - r.left - tw / 2) / (r.width - tw), 0, 1), e = sEdge();
  aim = e + f * (W - 2 * e);
}
if (slider) {
  slider.addEventListener('pointerdown', e => { e.preventDefault(); audio(); sliding = e.pointerId; try { slider.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ } slider.classList.add('on'); slideTo(e.clientX); });
  slider.addEventListener('pointermove', e => { if (sliding === e.pointerId) slideTo(e.clientX); });
  const end = e => { if (sliding === e.pointerId) { sliding = null; slider.classList.remove('on'); } };
  slider.addEventListener('pointerup', end); slider.addEventListener('pointercancel', end);
}
