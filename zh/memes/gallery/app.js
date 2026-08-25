'use strict';

import { listMemes, deleteMeme, clearMemes } from '/assets/meme-store.js';

const $ = (id) => document.getElementById(id);
const urls = [];   // revoked on unload

const fmtDate = (ms) => new Date(ms).toLocaleString(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});
const fmtSize = (bytes) => bytes > 1048576
  ? (bytes / 1048576).toFixed(1) + ' MB'
  : Math.max(1, Math.round(bytes / 1024)) + ' KB';

function caption(m) {
  const parts = [m.top, m.bottom].filter((x) => x && x.trim());
  return parts.length ? parts.join(' · ') : 'no caption';
}

function card(m) {
  const url = URL.createObjectURL(m.blob);
  urls.push(url);

  const el = document.createElement('article');
  el.className = 'card';

  const media = m.kind === 'video'
    ? Object.assign(document.createElement('video'), { src: url, controls: true, loop: true, muted: true, playsInline: true })
    : Object.assign(document.createElement('img'), { src: url, alt: caption(m), loading: 'lazy' });
  el.appendChild(media);

  const body = document.createElement('div');
  body.className = 'body';

  const cap = document.createElement('p');
  cap.className = 'cap';
  cap.textContent = caption(m);

  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = `${fmtDate(m.createdAt)} · ${m.kind === 'video' ? (m.seconds || '') + 's ' : ''}${m.ext.toUpperCase()} · ${fmtSize(m.blob.size)}`;

  const row = document.createElement('div');
  row.className = 'row';

  const dl = document.createElement('a');
  dl.className = 'mini';
  dl.href = url;
  dl.download = `dfv-meme-${m.id}.${m.ext}`;
  dl.textContent = '↓ Save again';

  const del = document.createElement('button');
  del.className = 'mini quiet';
  del.type = 'button';
  del.textContent = 'Delete';
  del.addEventListener('click', async () => { await deleteMeme(m.id); await load(); });

  row.append(dl, del);
  body.append(cap, meta, row);
  el.append(body);
  return el;
}

async function load() {
  const items = await listMemes();
  const grid = $('grid');
  grid.textContent = '';

  $('count').textContent = items.length
    ? `${items.length} meme${items.length === 1 ? '' : 's'} · ${fmtSize(items.reduce((s, m) => s + m.blob.size, 0))} stored in this browser`
    : '';

  if (!items.length) {
    $('empty').hidden = false;
    $('clear').hidden = true;
    return;
  }
  $('empty').hidden = true;
  $('clear').hidden = false;
  items.forEach((m) => grid.appendChild(card(m)));
}

$('clear').addEventListener('click', async () => {
  if (!confirm('Delete every meme stored in this browser? This cannot be undone.')) return;
  await clearMemes();
  await load();
});

window.addEventListener('unload', () => urls.forEach((u) => URL.revokeObjectURL(u)));

load();
