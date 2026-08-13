/* ============================================================================
   DFV — cliff countdown
   ----------------------------------------------------------------------------
   The deadline is read from the banner's data-deadline attribute, which holds
   the vesting cliff as a Unix timestamp taken directly from the DFVVesting
   contract:  pool.start + pool.cliffDuration  =  1787225987
              (20 August 2026, 11:39:47 UTC)

   No dependencies, no network access. If JavaScript is unavailable the markup
   already shows the date, so nothing is lost — this only adds the live ticking.
   ========================================================================== */

'use strict';

(function () {
  const banner = document.getElementById('cliff-banner');
  if (!banner) return;

  const deadline = Number(banner.dataset.deadline) * 1000;
  if (!Number.isFinite(deadline)) return;

  const out = document.getElementById('cliff-countdown');
  const label = document.getElementById('cliff-label');
  if (!out) return;

  const pad = (n) => String(n).padStart(2, '0');

  function unit(value, name) {
    const span = document.createElement('span');
    span.className = 'cd-unit';
    const v = document.createElement('b');
    v.textContent = value;
    const l = document.createElement('i');
    l.textContent = name;
    span.append(v, l);
    return span;
  }

  function render() {
    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      banner.classList.add('is-live');
      if (label) label.textContent = 'Vesting claims are open';
      out.textContent = '';
      out.append(unit('LIVE', 'claim now'));
      return true; // stop ticking
    }

    const s = Math.floor(remaining / 1000);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    out.textContent = '';
    if (days > 0) out.append(unit(days, days === 1 ? 'day' : 'days'));
    out.append(unit(pad(hours), 'hrs'), unit(pad(mins), 'min'), unit(pad(secs), 'sec'));
    return false;
  }

  if (render()) return;
  const timer = setInterval(() => { if (render()) clearInterval(timer); }, 1000);
})();

/* ----------------------------------------------------------------------------
   Vesting progress for the whole Blind Believers tranche.

   Every figure below is fixed at deployment and read from the contract once:
     start      1755689987   20 Aug 2025 11:39:47 UTC
     cliff ends 1787225987   20 Aug 2026 11:39:47 UTC   (365 days, 0% unlocked)
     fully      1944905987   19 Aug 2031                (5 years, per second)
     total      20,828,377,491.30 DFV                   (15% of supply)

   Nothing is fetched; this is arithmetic on constants.
   -------------------------------------------------------------------------- */
(function () {
  const el = document.getElementById('vesting-progress');
  if (!el) return;

  const CLIFF_END = 1787225987;
  const FULLY     = 1944905987;
  const TOTAL     = 20828377491.30;

  const bar = el.querySelector('[data-bar]');
  const pctOut = el.querySelector('[data-pct]');
  const amtOut = el.querySelector('[data-amount]');

  function render() {
    const now = Date.now() / 1000;
    let fraction;
    if (now <= CLIFF_END) fraction = 0;
    else if (now >= FULLY) fraction = 1;
    else fraction = (now - CLIFF_END) / (FULLY - CLIFF_END);

    const unlocked = TOTAL * fraction;

    if (bar) bar.style.width = (fraction * 100).toFixed(6) + '%';
    if (pctOut) pctOut.textContent = (fraction * 100).toFixed(4) + '%';
    if (amtOut) {
      amtOut.textContent = unlocked.toLocaleString('en-US', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      }) + ' DFV';
    }
  }

  render();
  setInterval(render, 1000);
})();
