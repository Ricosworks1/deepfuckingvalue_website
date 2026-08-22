/* ============================================================================
   DFV — meme maker
   ----------------------------------------------------------------------------
   Images and video are produced entirely in the browser. Pictures you choose
   are read with FileReader and drawn onto a canvas; video is recorded from that
   same canvas with MediaRecorder. Both are native browser APIs — there are no
   libraries here, and the page's CSP has no connect-src, so it has no mechanism
   to send anything anywhere.
   ========================================================================== */

'use strict';

const SIZE = 1080;
const CAT_SRC = '/assets/dfv-cat.png';
const $ = (id) => document.getElementById(id);

const state = {
  bg: '#ffffff',
  bgImage: null,
  catScale: 0.55,
  catPos: 'bottom-right',
  catFlip: false,
  catOn: true,
  top: '',
  bottom: '',
  style: 'impact',      // impact | caption | quote
  upper: true,
  motion: 'none',       // none | zoom | shake | pop | slide
};

const cat = new Image();
let catReady = false;
cat.onload = () => { catReady = true; render(); };
cat.src = CAT_SRC;

const canvas = $('canvas');
const ctx = canvas.getContext('2d');
canvas.width = canvas.height = SIZE;

/* ---------- text ---------- */

function fontFor(size) {
  if (state.style === 'impact') return `${size}px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`;
  if (state.style === 'caption') return `600 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  return `500 ${size}px Charter, "Iowan Old Style", Georgia, serif`;
}

function wrap(text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/* Fit text into a box, returning the chosen size and its lines. */
function fit(text, maxWidth, startSize, maxLines, minSize) {
  let size = startSize;
  let lines;
  for (;;) {
    ctx.font = fontFor(size);
    lines = wrap(text, maxWidth);
    if (lines.length <= maxLines || size <= minSize) break;
    size -= 4;
  }
  return { size, lines };
}

/* Classic Impact: white with a heavy black outline, top and bottom. */
function drawImpact(text, where, phase) {
  if (!text.trim()) return;
  const margin = SIZE * 0.05;
  const maxW = SIZE - margin * 2;
  const { size, lines } = fit(state.upper ? text.toUpperCase() : text, maxW, Math.round(SIZE * 0.11), 3, SIZE * 0.045);

  const lh = size * 1.08;
  const block = lh * lines.length;
  let y = where === 'top' ? margin + size * 0.85 : SIZE - margin - block + size * 0.85;

  ctx.save();
  if (phase) applyTextMotion(phase, where);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(4, size * 0.13);
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#fff';
  lines.forEach((l, i) => {
    ctx.strokeText(l, SIZE / 2, y + i * lh);
    ctx.fillText(l, SIZE / 2, y + i * lh);
  });
  ctx.restore();
}

/* Caption bar: solid band with dark text, the modern format. */
function drawCaption(text, where) {
  if (!text.trim()) return;
  const pad = SIZE * 0.045;
  const maxW = SIZE - pad * 2;
  const { size, lines } = fit(state.upper ? text.toUpperCase() : text, maxW, Math.round(SIZE * 0.055), 4, SIZE * 0.03);

  const lh = size * 1.32;
  const barH = lh * lines.length + pad * 1.4;
  const barY = where === 'top' ? 0 : SIZE - barH;

  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, barY, SIZE, barH);
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.font = fontFor(size);
  lines.forEach((l, i) => ctx.fillText(l, SIZE / 2, barY + pad * 0.7 + size + i * lh));
  ctx.restore();
}

/* Quote: serif, sentence case, centred over a scrim. */
function drawQuote(text, where) {
  if (!text.trim()) return;
  const margin = SIZE * 0.08;
  const maxW = SIZE - margin * 2;
  const { size, lines } = fit(text, maxW, Math.round(SIZE * 0.065), 6, SIZE * 0.032);

  const lh = size * 1.42;
  const block = lh * lines.length;
  const y = where === 'top' ? margin + size : SIZE - margin - block + size;

  ctx.save();
  const grad = ctx.createLinearGradient(0, y - size * 1.4, 0, y + block);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y - size * 1.4, SIZE, block + size * 1.1);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = fontFor(size);
  lines.forEach((l, i) => ctx.fillText(l, SIZE / 2, y + i * lh));
  ctx.restore();
}

function drawText(text, where, phase) {
  if (state.style === 'caption') return drawCaption(text, where);
  if (state.style === 'quote') return drawQuote(text, where);
  return drawImpact(text, where, phase);
}

/* ---------- motion (video only) ---------- */

function applyTextMotion(phase, where) {
  if (state.motion === 'pop') {
    const k = Math.min(1, phase * 3);
    const s = 0.7 + 0.3 * (1 - Math.pow(1 - k, 3));
    ctx.translate(SIZE / 2, where === 'top' ? SIZE * 0.15 : SIZE * 0.85);
    ctx.scale(s, s);
    ctx.translate(-SIZE / 2, -(where === 'top' ? SIZE * 0.15 : SIZE * 0.85));
  } else if (state.motion === 'slide') {
    const k = Math.min(1, phase * 2.5);
    const off = (1 - (1 - Math.pow(1 - k, 3))) * SIZE * 0.25;
    ctx.translate(0, where === 'top' ? -off : off);
  }
}

function applyStageMotion(phase) {
  if (state.motion === 'zoom') {
    const s = 1 + 0.08 * phase;
    ctx.translate(SIZE / 2, SIZE / 2); ctx.scale(s, s); ctx.translate(-SIZE / 2, -SIZE / 2);
  } else if (state.motion === 'shake') {
    const a = Math.sin(phase * Math.PI * 18) * SIZE * 0.012;
    const b = Math.cos(phase * Math.PI * 22) * SIZE * 0.012;
    ctx.translate(a, b);
  }
}

/* ---------- scene ---------- */

function drawBackground() {
  if (state.bgImage) {
    const img = state.bgImage;
    const s = Math.max(SIZE / img.width, SIZE / img.height);
    ctx.drawImage(img, (SIZE - img.width * s) / 2, (SIZE - img.height * s) / 2, img.width * s, img.height * s);
  } else {
    ctx.fillStyle = state.bg;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
}

function drawCat() {
  if (!state.catOn || !catReady) return;
  const w = SIZE * state.catScale;
  const h = w * (cat.height / cat.width);
  const p = SIZE * 0.03;
  const at = {
    'bottom-left': [p, SIZE - h - p], 'bottom-right': [SIZE - w - p, SIZE - h - p],
    'top-left': [p, p], 'top-right': [SIZE - w - p, p], center: [(SIZE - w) / 2, (SIZE - h) / 2],
  }[state.catPos];
  ctx.save();
  if (state.catFlip) { ctx.translate(at[0] + w, at[1]); ctx.scale(-1, 1); ctx.drawImage(cat, 0, 0, w, h); }
  else ctx.drawImage(cat, at[0], at[1], w, h);
  ctx.restore();
}

function render(phase = 0) {
  ctx.save();
  ctx.clearRect(0, 0, SIZE, SIZE);
  if (phase) applyStageMotion(phase);
  drawBackground();
  drawCat();
  ctx.restore();
  drawText(state.top, 'top', phase);
  drawText(state.bottom, 'bottom', phase);
}

/* ---------- export ---------- */

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

$('download').addEventListener('click', () => {
  render();
  canvas.toBlob((b) => b && saveBlob(b, 'dfv-meme.png'), 'image/png');
});

function pickVideoType() {
  const wanted = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  return wanted.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || null;
}

$('record').addEventListener('click', async () => {
  const btn = $('record');
  const msg = $('video-msg');
  const type = pickVideoType();

  if (!type) {
    msg.textContent = 'This browser cannot record video. Try Chrome, Edge or Safari.';
    msg.hidden = false;
    return;
  }

  const seconds = Number($('duration').value);
  btn.disabled = true;
  msg.hidden = false;
  msg.textContent = `Recording ${seconds}s…`;

  const stream = canvas.captureStream(30);
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const done = new Promise((res) => { rec.onstop = res; });
  rec.start();

  const t0 = performance.now();
  await new Promise((finish) => {
    (function frame(now) {
      const elapsed = (now - t0) / 1000;
      render(Math.min(1, elapsed / seconds));
      if (elapsed < seconds) requestAnimationFrame(frame);
      else finish();
    })(t0);
  });

  rec.stop();
  await done;

  const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
  saveBlob(new Blob(chunks, { type }), `dfv-meme.${ext}`);
  msg.textContent = `Saved as .${ext}` + (ext === 'webm' ? ' — X may need MP4; Telegram accepts WebM fine.' : '');
  btn.disabled = false;
  render();
});

/* ---------- controls ---------- */

const swatches = () => document.querySelectorAll('.swatch');
function selectSwatch(el) {
  swatches().forEach((s) => s.setAttribute('aria-pressed', 'false'));
  if (el) el.setAttribute('aria-pressed', 'true');
}
swatches().forEach((b) => b.addEventListener('click', () => {
  state.bg = b.dataset.color; state.bgImage = null;
  $('file-name').textContent = ''; selectSwatch(b); render();
}));

$('upload').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => { state.bgImage = img; selectSwatch(null); $('file-name').textContent = f.name; render(); };
    img.onerror = () => { $('file-name').textContent = 'Could not read that file as an image.'; };
    img.src = r.result;
  };
  r.readAsDataURL(f);
});

$('top').addEventListener('input', (e) => { state.top = e.target.value; render(); });
$('bottom').addEventListener('input', (e) => { state.bottom = e.target.value; render(); });
$('style').addEventListener('change', (e) => { state.style = e.target.value; render(); });
$('upper').addEventListener('change', (e) => { state.upper = e.target.checked; render(); });
$('cat-on').addEventListener('change', (e) => { state.catOn = e.target.checked; render(); });
$('cat-flip').addEventListener('change', (e) => { state.catFlip = e.target.checked; render(); });
$('cat-size').addEventListener('input', (e) => { state.catScale = e.target.value / 100; render(); });
$('cat-pos').addEventListener('change', (e) => { state.catPos = e.target.value; render(); });
$('motion').addEventListener('change', (e) => { state.motion = e.target.value; render(); });

const PROMPTS = [
  ['when the cliff', 'finally ends'],
  ['84.51% in the pool', 'zero for the team'],
  ['thou shalt', 'not dump'],
  ['everything is read from mainnet', 'nothing typed by hand'],
  ['me explaining dfvnomics', 'to my wife'],
  ['diamond paws', 'since 2024'],
  ['first: delegate', 'then complain'],
  ['bought the top', 'held anyway'],
];

$('surprise').addEventListener('click', () => {
  const [t, b] = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
  state.top = t; state.bottom = b;
  $('top').value = t; $('bottom').value = b;
  render();
});

$('reset').addEventListener('click', () => {
  state.top = state.bottom = '';
  $('top').value = $('bottom').value = '';
  state.bgImage = null; state.bg = '#ffffff';
  $('file-name').textContent = ''; $('upload').value = '';
  selectSwatch(document.querySelector('.swatch[data-color="#ffffff"]'));
  render();
});

render();
