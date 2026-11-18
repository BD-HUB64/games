// 폰 테트리스. 규칙은 PC 일정관리의 테트리스와 같다 (7개 묶음 섞기, 줄 점수 100/300/500/800 × 단계, 한번에 내리기 칸당 2점, 10줄마다 한 단계).
'use strict';
const W = 10, H = 20;
const SHAPES = [
  [4, [[0, 1], [1, 1], [2, 1], [3, 1]]],
  [2, [[0, 0], [1, 0], [0, 1], [1, 1]]],
  [3, [[1, 0], [0, 1], [1, 1], [2, 1]]],
  [3, [[1, 0], [2, 0], [0, 1], [1, 1]]],
  [3, [[0, 0], [1, 0], [1, 1], [2, 1]]],
  [3, [[0, 0], [0, 1], [1, 1], [2, 1]]],
  [3, [[2, 0], [0, 1], [1, 1], [2, 1]]],
];
const COLORS = ['#00bedc', '#ebc800', '#a046c8', '#3cb446', '#dc3232', '#325ad2', '#f08c14'];
const BEST_KEY = 'tetris.phone.best';
const $ = id => document.getElementById(id);

let board, cur, next, bag, score, lines, best, over, paused, acc, last, started;
try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { best = 0; }

const level = () => Math.floor(lines / 10);
const interval = () => Math.max(0.07, 0.8 - 0.07 * level()) * 1000;

function draw7() {
  if (!bag.length) {
    bag = [0, 1, 2, 3, 4, 5, 6];
    for (let i = 6; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  }
  return bag.pop();
}
const piece = k => ({ k, n: SHAPES[k][0], cells: SHAPES[k][1].map(c => c.slice()), x: Math.floor((W - SHAPES[k][0]) / 2), y: 0 });
const blocks = p => p.cells.map(c => [p.x + c[0], p.y + c[1]]);
const fits = p => blocks(p).every(([x, y]) => x >= 0 && x < W && y < H && (y < 0 || !board[y][x]));
const copy = p => ({ ...p, cells: p.cells.map(c => c.slice()) });

function reset() {
  board = Array.from({ length: H }, () => Array(W).fill(0));
  bag = []; score = 0; lines = 0; over = false; paused = false; acc = 0;
  next = draw7(); spawn();
}
function spawn() {
  cur = piece(next); next = draw7();
  if (!fits(cur)) over = true;
}
function tryMove(dx, dy) {
  const p = copy(cur); p.x += dx; p.y += dy;
  if (fits(p)) { cur = p; return true; }
  return false;
}
function rotate() {
  const r = copy(cur);
  r.cells = cur.cells.map(c => [cur.n - 1 - c[1], c[0]]);
  for (const dx of [0, -1, 1, -2, 2]) { const p = copy(r); p.x += dx; if (fits(p)) { cur = p; return; } }
}
function lock() {
  for (const [x, y] of blocks(cur)) if (y >= 0) board[y][x] = cur.k + 1;
  let cleared = 0;
  for (let y = H - 1; y >= 0; y--) {
    if (board[y].every(c => c)) { board.splice(y, 1); board.unshift(Array(W).fill(0)); cleared++; y++; }
  }
  lines += cleared;
  score += [0, 100, 300, 500, 800][cleared] * (level() + 1);
  spawn();
  if (over && score > best) { best = score; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* 저장 못 해도 계속 */ } }
}
function stepDown(soft) {
  if (tryMove(0, 1)) { if (soft) score += 1; } else lock();
}
function hardDrop() {
  let n = 0; while (tryMove(0, 1)) n++;
  score += 2 * n; lock();
}
function ghost() { const g = copy(cur); for (;;) { const t = copy(g); t.y++; if (fits(t)) g.y++; else return g; } }

// ───────── 그리기 ─────────
const cv = $('board'), ctx = cv.getContext('2d'), nx = $('next').getContext('2d');
let cell = 20, dpr = 1;
function fit() {
  const st = $('stage').getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  const sideW = $('side').offsetWidth + 8;
  cell = Math.max(10, Math.floor(Math.min((st.width - 16 - sideW) / W, (st.height - 12) / H)));
  cv.style.width = cell * W + 'px'; cv.style.height = cell * H + 'px';
  cv.width = cell * W * dpr; cv.height = cell * H * dpr;
  // 오른쪽 열이 게임판보다 길면(큰 글씨 설정 등) 아래 단추와 겹치므로 단계별로 줄인다
  const sd = $('side'); sd.classList.remove('c1', 'c2', 'c3');
  for (const c of ['c1', 'c2', 'c3']) { if (sd.scrollHeight <= cell * H + 1) break; sd.classList.add(c); }
}
function block(c, x, y, s, color, alpha) {
  c.globalAlpha = alpha == null ? 1 : alpha;
  c.fillStyle = color; c.fillRect(x + 1, y + 1, s - 2, s - 2);
  if (alpha == null) { c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(x + 1, y + 1, s - 2, Math.max(2, s * 0.14)); }
  c.globalAlpha = 1;
}
function render() {
  const c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#101113'; c.fillRect(0, 0, cell * W, cell * H);
  c.strokeStyle = '#1b1d21'; c.lineWidth = 1;
  for (let x = 1; x < W; x++) { c.beginPath(); c.moveTo(x * cell + .5, 0); c.lineTo(x * cell + .5, cell * H); c.stroke(); }
  for (let y = 1; y < H; y++) { c.beginPath(); c.moveTo(0, y * cell + .5); c.lineTo(cell * W, y * cell + .5); c.stroke(); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (board[y][x]) block(c, x * cell, y * cell, cell, COLORS[board[y][x] - 1]);
  if (!over) {
    for (const [x, y] of blocks(ghost())) if (y >= 0) block(c, x * cell, y * cell, cell, COLORS[cur.k], 0.25);
    for (const [x, y] of blocks(cur)) if (y >= 0) block(c, x * cell, y * cell, cell, COLORS[cur.k]);
  }
  // 다음 블록
  const n = nx; n.setTransform(1, 0, 0, 1, 0, 0); n.clearRect(0, 0, 96, 96);
  const [bn, cells] = SHAPES[next], s = 20, ox = (96 - bn * s) / 2, oy = (96 - 2 * s) / 2 - (bn === 4 ? s / 2 : 0);
  for (const [x, y] of cells) block(n, ox + x * s, oy + y * s - (bn === 4 ? 0 : 0), s, COLORS[next]);
  $('score').textContent = score; $('level').textContent = level() + 1; $('lines').textContent = lines;
  $('best').textContent = Math.max(best, score);
}

// ───────── 반복 ─────────
function showMsg(title, sub, btn) {
  $('msgTitle').textContent = title; $('msgSub').textContent = sub; $('msg').hidden = false;
  $('quitBtn').hidden = !(paused && !over);
  // 단추는 모두 동그란 그림: 시작=초록 START, 계속하기=파랑 ▶, 다시 하기=초록 ⟳
  const kind = btn === '시작' ? 'start' : btn === '계속하기' ? 'resume' : 'again';
  const b = $('msgBtn');
  b.className = 'go round ' + kind; b.setAttribute('aria-label', btn);
  b.innerHTML = kind === 'start' ? 'START' : kind === 'resume' ? ICON_PLAY : ICON_AGAIN;
}
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8.5 5.5l10 6.5-10 6.5z" fill="#fff" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const ICON_AGAIN = '<svg viewBox="0 0 24 24"><path d="M17.75 16.82A7.5 7.5 0 1 1 15.75 5.5" fill="none" stroke="#fff" stroke-width="3.6"/><path d="M20.1 8.1L17.2 1.1 12.6 9z" fill="#fff"/></svg>';
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(100, t - (last || t)); last = t;
  if (started && !over && !paused) {
    acc += dt;
    while (acc >= interval() && !over) { acc -= interval(); stepDown(false); }
  }
  if (over) showMsg('게임 끝', `점수 ${score}` + (score >= best && score > 0 ? ' · 최고점!' : ''), '다시 하기');
  render();
}
function setPause(p) {
  if (over || !started) return;
  paused = p; $('pause').classList.toggle('is-paused', p);
  if (p) showMsg('멈춤', '아래 단추로 계속합니다', '계속하기'); else $('msg').hidden = true;
}
function begin() { reset(); started = true; $('msg').hidden = true; $('pause').classList.remove('is-paused'); }
$('msgBtn').onclick = () => { if (paused && !over) setPause(false); else begin(); };
function quitGame() {   // 판을 끝내고 처음 화면으로 (최고점은 그대로)
  if (score > best) { best = score; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* 저장 못 해도 계속 */ } }
  reset(); started = false; $('pause').classList.remove('is-paused');
  showMsg('테트리스', '', '시작');
}
$('quitBtn').onclick = quitGame;
$('sideQuit').onclick = () => {   // 옆 단추: 실수로 눌러도 판이 날아가지 않게 한 번 묻는다
  if (!started) return;
  const wasPlaying = !paused && !over;
  if (wasPlaying) setPause(true);
  if (over || confirm('이번 판을 끝낼까요?')) quitGame();
  else if (wasPlaying) setPause(false);
};
$('pause').onclick = () => setPause(!paused);
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });

// ───────── 조작: 단추 (왼쪽·오른쪽·아래는 누르고 있으면 반복) ─────────
const act = {
  left: () => { if (!paused && !over) tryMove(-1, 0); },
  right: () => { if (!paused && !over) tryMove(1, 0); },
  down: () => { if (!paused && !over) { stepDown(true); acc = 0; } },
  rot: () => { if (!paused && !over) rotate(); },
  drop: () => { if (!paused && !over) { hardDrop(); acc = 0; } },
};
const repeat = { left: 55, right: 55, down: 45 };
document.querySelectorAll('#pad button').forEach(b => {
  const k = b.dataset.k; let t1 = 0, t2 = 0;
  const stop = () => { clearTimeout(t1); clearInterval(t2); b.classList.remove('on'); };
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); stop(); b.classList.add('on'); act[k]();
    if (repeat[k]) t1 = setTimeout(() => { t2 = setInterval(act[k], repeat[k]); }, 170);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, stop));
  b.addEventListener('contextmenu', e => e.preventDefault());
});
// 판을 톡 치면 돌리기
cv.addEventListener('pointerdown', e => { e.preventDefault(); act.rot(); });
document.addEventListener('keydown', e => {   // PC 브라우저에서 시험할 때
  const m = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rot', ' ': 'drop' }[e.key];
  if (m) { e.preventDefault(); act[m](); } else if (e.key === 'p') setPause(!paused);
});
// 화면을 두 번 눌러 확대되거나 끌어서 스크롤되지 않게
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

window.addEventListener('resize', fit);
// 폰은 주소창이 나타나고 사라지면서 화면 높이가 나중에 바뀐다. 창 크기 신호가 없어도 칸 크기를 다시 맞춘다.
if (window.ResizeObserver) new ResizeObserver(fit).observe($('stage'));
window.addEventListener('orientationchange', () => setTimeout(fit, 300));
window.addEventListener('load', () => setTimeout(fit, 300));
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
reset(); fit(); started = false;
showMsg('테트리스', '', '시작');
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
