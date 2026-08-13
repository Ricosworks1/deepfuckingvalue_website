/* ============================================================================
   DFV — meme maker
   ----------------------------------------------------------------------------
   Everything happens in the browser. Images you choose are read with FileReader
   and drawn straight onto a canvas; nothing is uploaded, nothing is stored, and
   the page makes no network request of any kind (its CSP has no connect-src).

   No dependencies.
   ========================================================================== */

'use strict';

const SIZE = 1080;                       // output is a 1080x1080 square
const CAT_SRC = '/assets/dfv-cat.png';

const $ = (id) => document.getElementById(id);

const state = {
  bg: '#ffffff',
  bgImage: null,          // HTMLImageElement when the user supplies one
  catScale: 0.55,         // fraction of canvas width
  catPos: 'bottom-right',
  catFlip: false,
  catOn: true,
  top: '',
  bottom: '',
};

const cat = new Image();
let catReady = false;
cat.onload = () => { catReady = true; draw(); };
cat.onerror = () => { catReady = false; draw(); };
cat.src = CAT_SRC;

const canvas = $('canvas');
const ctx = canvas.getContext('2d');
canvas.width = SIZE;
canvas.height = SIZE;

/* ---------- drawing ---------- */

function drawBackground() {
  if (state.bgImage) {
    // cover-fit, centred
    const img = state.bgImage;
    const scale = Math.max(SIZE / img.width, SIZE / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  } else {
    ctx.fillStyle = state.bg;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
}

function drawCat() {
  if (!state.catOn || !catReady) return;

  const w = SIZE * state.catScale;
  const h = w * (cat.height / cat.width);
  const pad = SIZE * 0.03;

  let x, y;
  switch (state.catPos) {
    case 'bottom-left':  x = pad;                 y = SIZE - h - pad;      break;
    case 'bottom-right': x = SIZE - w - pad;      y = SIZE - h - pad;      break;
    case 'top-left':     x = pad;                 y = pad;                 break;
    case 'top-right':    x = SIZE - w - pad;      y = pad;                 break;
    default:             x = (SIZE - w) / 2;      y = (SIZE - h) / 2;      break;
  }

  ctx.save();
  if (state.catFlip) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(cat, 0, 0, w, h);
  } else {
    ctx.drawImage(cat, x, y, w, h);
  }
  ctx.restore();
}

/* Wrap text to the canvas width, returning the lines that fit. */
function wrap(text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(text, position) {
  if (!text.trim()) return;

  const margin = SIZE * 0.05;
  const maxWidth = SIZE - margin * 2;

  // Shrink until it fits in at most three lines.
  let fontSize = Math.round(SIZE * 0.11);
  let lines;
  for (;;) {
    ctx.font = `${fontSize}px Impact, Haettenschweiler, "Arial Narrow Bold", "Anton", sans-serif`;
    lines = wrap(text.toUpperCase(), maxWidth);
    if (lines.length <= 3 || fontSize <= SIZE * 0.045) break;
    fontSize -= 4;
  }

  const lineHeight = fontSize * 1.08;
  const block = lineHeight * lines.length;
  const startY = position === 'top'
    ? margin + fontSize * 0.85
    : SIZE - margin - block + fontSize * 0.85;

  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(4, fontSize * 0.13);
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#fff';

  lines.forEach((l, i) => {
    const y = startY + i * lineHeight;
    ctx.strokeText(l, SIZE / 2, y);
    ctx.fillText(l, SIZE / 2, y);
  });
}

function draw() {
  ctx.clearRect(0, 0, SIZE, SIZE);
  drawBackground();
  drawCat();
  drawText(state.top, 'top');
  drawText(state.bottom, 'bottom');
}

/* ---------- controls ---------- */

function selectSwatch(el) {
  document.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-pressed', 'false'));
  if (el) el.setAttribute('aria-pressed', 'true');
}

document.querySelectorAll('.swatch').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.bg = btn.dataset.color;
    state.bgImage = null;
    $('file-name').textContent = '';
    selectSwatch(btn);
    draw();
  });
});

$('upload').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      state.bgImage = img;
      selectSwatch(null);
      $('file-name').textContent = file.name;
      draw();
    };
    img.onerror = () => { $('file-name').textContent = 'That file could not be read as an image.'; };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);   // stays in this tab; never sent anywhere
});

$('top').addEventListener('input', (e) => { state.top = e.target.value; draw(); });
$('bottom').addEventListener('input', (e) => { state.bottom = e.target.value; draw(); });

$('cat-on').addEventListener('change', (e) => { state.catOn = e.target.checked; draw(); });
$('cat-flip').addEventListener('change', (e) => { state.catFlip = e.target.checked; draw(); });
$('cat-size').addEventListener('input', (e) => { state.catScale = Number(e.target.value) / 100; draw(); });
$('cat-pos').addEventListener('change', (e) => { state.catPos = e.target.value; draw(); });

$('download').addEventListener('click', () => {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dfv-meme.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
});

/* A few starters, so the page is never a blank box. */
const PROMPTS = [
  ['when the cliff', 'finally ends'],
  ['me explaining dfvnomics', 'to my wife'],
  ['84.51% in the pool', 'zero for the team'],
  ['thou shalt', 'not dump'],
  ['sir this is', 'a decentralised casino'],
  ['bought the top', 'held anyway'],
  ['my portfolio', 'my rules'],
  ['diamond paws', 'since 2024'],
];

$('surprise').addEventListener('click', () => {
  const [t, b] = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
  state.top = t; state.bottom = b;
  $('top').value = t; $('bottom').value = b;
  draw();
});

$('reset').addEventListener('click', () => {
  state.top = state.bottom = '';
  $('top').value = $('bottom').value = '';
  state.bgImage = null;
  state.bg = '#ffffff';
  $('file-name').textContent = '';
  $('upload').value = '';
  selectSwatch(document.querySelector('.swatch[data-color="#ffffff"]'));
  draw();
});

draw();
