(function () {
  'use strict';

  const DEADLINE_KEY = 'bz_deadline_ms';
  const DEADLINE_HOURS = 72;
  const COUNT_POLL_MS = 30_000;

  const formatNum = (n) => Number(n).toLocaleString('en-US');
  const pad2 = (n) => String(n).padStart(2, '0');

  // ── Live signature counter ─────────────────────────────────────
  const heroCounter = document.getElementById('hero-counter');
  const heroCounterNum = document.getElementById('hero-counter-num');
  const petitionCounter = document.getElementById('petition-counter');
  const petitionCounterNum = document.getElementById('petition-counter-num');
  const stickyStatus = document.getElementById('sticky-cta-status');

  let count = 0;
  let counterRevealed = false;

  function renderCounter() {
    const text = formatNum(count);
    if (heroCounterNum) heroCounterNum.textContent = text;
    if (petitionCounterNum) petitionCounterNum.textContent = text;
    if (stickyStatus) stickyStatus.textContent = text + ' signed';
  }

  async function fetchCount() {
    try {
      const res = await fetch('/api/count', { cache: 'no-store' });
      if (!res.ok) return;
      const out = await res.json();
      const n = Number(out.count);
      if (!Number.isFinite(n)) return;
      // Don't regress past an optimistic local bump that hasn't propagated yet.
      if (n > count) count = n;
      renderCounter();
      if (!counterRevealed) {
        heroCounter.hidden = false;
        petitionCounter.hidden = false;
        counterRevealed = true;
      }
    } catch (e) {}
  }

  fetchCount();
  setInterval(fetchCount, COUNT_POLL_MS);

  function bumpCounter() {
    count += 1;
    renderCounter();
  }

  // ── Countdown urgency banner ───────────────────────────────────
  const urgencyBanner = document.getElementById('urgency-banner');
  const countdownEl = document.getElementById('countdown');

  function readDeadline() {
    try {
      const saved = Number(localStorage.getItem(DEADLINE_KEY));
      if (saved && saved > Date.now()) return saved;
    } catch (e) {}
    const next = Date.now() + DEADLINE_HOURS * 3600 * 1000;
    try { localStorage.setItem(DEADLINE_KEY, String(next)); } catch (e) {}
    return next;
  }

  const deadline = readDeadline();

  function renderCountdown() {
    const total = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    countdownEl.textContent = `${pad2(d)}d : ${pad2(h)}h : ${pad2(m)}m : ${pad2(s)}s`;
  }

  urgencyBanner.hidden = false;
  renderCountdown();
  setInterval(renderCountdown, 1000);

  // ── Smooth scroll for in-page anchors ──────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // ── Sticky CTA (appears after hero scroll) ─────────────────────
  const stickyCta = document.getElementById('sticky-cta');
  const hero = document.querySelector('.hero');

  function updateSticky() {
    const threshold = hero ? hero.offsetTop + hero.offsetHeight - 200 : 500;
    stickyCta.hidden = window.scrollY <= threshold;
  }

  window.addEventListener('scroll', updateSticky, { passive: true });
  updateSticky();

  // ── Petition form ──────────────────────────────────────────────
  const form = document.getElementById('petition-form');
  const errEl = document.getElementById('petition-error');
  const success = document.getElementById('petition-success');
  const successName = document.getElementById('success-first-name');

  const showError = (msg) => {
    errEl.textContent = msg;
    errEl.hidden = false;
  };
  const clearError = () => {
    errEl.textContent = '';
    errEl.hidden = true;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const first       = String(data.get('first') || '').trim();
    const last        = String(data.get('last') || '').trim();
    const email       = String(data.get('email') || '').trim();
    const zip         = String(data.get('zip') || '').trim();
    const phoneRaw    = String(data.get('phone') || '').trim();
    const countryCode = String(data.get('country_code') || '+1').trim();
    const phone       = phoneRaw ? `${countryCode} ${phoneRaw}` : '';

    if (!first) { showError('Enter your first name.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { showError('Enter a valid email.'); return; }

    clearError();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'SIGNING…';

    try {
      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          first_name: first,
          last_name: last,
          email,
          phone,
          zip,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.ok === false) {
        throw new Error(out.error || `Submission failed (${res.status})`);
      }
      successName.textContent = first;
      form.hidden = true;
      success.hidden = false;
      bumpCounter();
      setTimeout(() => {
        const donate = document.getElementById('donate');
        if (donate) donate.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 2000);
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });

  // ── Donate grid ────────────────────────────────────────────────
  const donateAmtBtns = document.querySelectorAll('.donate-amt');
  const donateCustomRow = document.getElementById('donate-custom-row');
  const donateCustomInput = document.getElementById('donate-custom-input');
  const donateSubmit = document.getElementById('donate-submit');
  const donateThanks = document.getElementById('donate-thanks');
  const donateToggleBtns = document.querySelectorAll('.donate-toggle-btn');

  let selectedAmount = 65;
  let isCustom = false;
  let isMonthly = false;

  function updateDonateUI() {
    donateAmtBtns.forEach((btn) => {
      const amt = Number(btn.dataset.amt);
      const isActive = !isCustom && amt === selectedAmount;
      btn.classList.toggle('is-selected', isActive);
      let perMonth = btn.querySelector('.per-month');
      if (isMonthly) {
        if (!perMonth) {
          perMonth = document.createElement('span');
          perMonth.className = 'per-month';
          perMonth.textContent = '/ MONTH';
          btn.appendChild(perMonth);
        }
      } else if (perMonth) {
        perMonth.remove();
      }
    });
    donateCustomRow.classList.toggle('is-selected', isCustom);

    const amount = isCustom ? Number(donateCustomInput.value) || 0 : selectedAmount;
    const valid = amount >= 1;
    donateSubmit.disabled = !valid;
    donateSubmit.textContent = `DONATE $${amount || 0}${isMonthly ? ' / MONTH' : ''} →`;
  }

  donateAmtBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedAmount = Number(btn.dataset.amt);
      isCustom = false;
      donateCustomInput.value = '';
      updateDonateUI();
    });
  });

  donateCustomRow.addEventListener('click', (e) => {
    if (e.target === donateCustomInput) return;
    isCustom = true;
    donateCustomInput.focus();
    updateDonateUI();
  });

  donateCustomInput.addEventListener('input', () => {
    isCustom = true;
    updateDonateUI();
  });

  donateToggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      isMonthly = btn.dataset.monthly === 'true';
      donateToggleBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
      updateDonateUI();
    });
  });

  donateSubmit.addEventListener('click', () => {
    if (donateSubmit.disabled) return;
    donateSubmit.disabled = true;
    const original = donateSubmit.textContent;
    donateSubmit.textContent = 'PROCESSING…';
    setTimeout(() => {
      donateSubmit.textContent = original;
      donateSubmit.disabled = false;
      donateThanks.hidden = false;
      setTimeout(() => { donateThanks.hidden = true; }, 3500);
    }, 700);
  });

  updateDonateUI();
})();
