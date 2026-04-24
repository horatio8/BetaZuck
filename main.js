(function () {
  'use strict';

  const BASE_SIGNATURES = 47293;
  const COUNTER_KEY = 'bz_sig_count';
  const DEADLINE_KEY = 'bz_deadline_ms';
  const DEADLINE_HOURS = 72;

  const formatNum = (n) => Number(n).toLocaleString('en-US');
  const pad2 = (n) => String(n).padStart(2, '0');

  // ── Live signature counter ─────────────────────────────────────
  const heroCounter = document.getElementById('hero-counter');
  const heroCounterNum = document.getElementById('hero-counter-num');
  const petitionCounter = document.getElementById('petition-counter');
  const petitionCounterNum = document.getElementById('petition-counter-num');
  const stickyStatus = document.getElementById('sticky-cta-status');

  function readCounter() {
    try {
      const saved = Number(localStorage.getItem(COUNTER_KEY));
      if (saved && saved >= BASE_SIGNATURES) return saved;
    } catch (e) {}
    return BASE_SIGNATURES;
  }

  function writeCounter(n) {
    try { localStorage.setItem(COUNTER_KEY, String(n)); } catch (e) {}
  }

  let count = readCounter();

  function renderCounter() {
    const text = formatNum(count);
    if (heroCounterNum) heroCounterNum.textContent = text;
    if (petitionCounterNum) petitionCounterNum.textContent = text;
    if (stickyStatus) stickyStatus.textContent = text + ' signed';
  }

  heroCounter.hidden = false;
  petitionCounter.hidden = false;
  renderCounter();

  setInterval(() => {
    count += (Math.random() < 0.55 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0);
    writeCounter(count);
    renderCounter();
  }, 1800);

  function bumpCounter() {
    count += 1;
    writeCounter(count);
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
  const openShare = document.getElementById('open-share');

  const showError = (msg) => {
    errEl.textContent = msg;
    errEl.hidden = false;
  };
  const clearError = () => {
    errEl.textContent = '';
    errEl.hidden = true;
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const first = String(data.get('first') || '').trim();
    const email = String(data.get('email') || '').trim();

    if (!first) { showError('Enter your first name.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { showError('Enter a valid email.'); return; }

    clearError();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'SIGNING…';

    setTimeout(() => {
      successName.textContent = first;
      form.hidden = true;
      success.hidden = false;
      bumpCounter();
      openModal();
    }, 650);
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

  // ── Share modal ────────────────────────────────────────────────
  const shareModal = document.getElementById('share-modal');
  const shareClose = document.getElementById('share-close');
  const shareCopy = document.getElementById('share-copy');
  const shareButtons = document.querySelectorAll('.share-btn');

  const SHARE_URL = 'https://betazuck.com';
  const SHARE_TEXT = 'Meta silenced 1.3 million voices with no warning. Sign the petition. Fight back. →';

  function openModal() { shareModal.hidden = false; }
  function closeModal() { shareModal.hidden = true; }

  openShare.addEventListener('click', openModal);
  shareClose.addEventListener('click', closeModal);
  shareModal.addEventListener('click', (e) => {
    if (e.target === shareModal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !shareModal.hidden) closeModal();
  });

  function copyShareLink() {
    const text = `${SHARE_TEXT} ${SHARE_URL}`;
    const done = () => {
      shareCopy.classList.add('is-copied');
      shareCopy.textContent = '✓ LINK COPIED';
      setTimeout(() => {
        shareCopy.classList.remove('is-copied');
        shareCopy.textContent = 'COPY LINK';
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  shareCopy.addEventListener('click', copyShareLink);
  shareButtons.forEach((btn) => btn.addEventListener('click', copyShareLink));
})();
