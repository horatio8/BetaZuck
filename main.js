(function () {
  'use strict';

  const DEADLINE_KEY = 'bz_deadline_ms';
  const DEADLINE_HOURS = 72;
  const COUNT_POLL_MS = 30_000;
  const CONTENT_CACHE_KEY = 'bz_content_cache';

  const formatNum = (n) => Number(n).toLocaleString('en-US');
  const pad2 = (n) => String(n).padStart(2, '0');
  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── CMS content load + apply ───────────────────────────────────
  function getNested(obj, path) {
    if (!obj) return undefined;
    return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  function applyContent(content) {
    if (!content || typeof content !== 'object') return;

    // Text swaps: <el data-cms-text="path">
    document.querySelectorAll('[data-cms-text]').forEach((el) => {
      const v = getNested(content, el.getAttribute('data-cms-text'));
      if (v !== undefined && v !== null) el.textContent = String(v);
    });

    // HTML swaps (allow inline tags like <strong>): <el data-cms-html="path">
    document.querySelectorAll('[data-cms-html]').forEach((el) => {
      const v = getNested(content, el.getAttribute('data-cms-html'));
      if (v !== undefined && v !== null) el.innerHTML = String(v);
    });

    // Attribute swaps: <el data-cms-attr="attr:path">
    document.querySelectorAll('[data-cms-attr]').forEach((el) => {
      const spec = el.getAttribute('data-cms-attr') || '';
      const [attr, path] = spec.split(':');
      if (!attr || !path) return;
      const v = getNested(content, path.trim());
      if (v !== undefined && v !== null) el.setAttribute(attr.trim(), String(v));
    });

    // Hero title (variable lines, last one is accent).
    const heroTitle = document.getElementById('hero-title');
    const heroLines = getNested(content, 'hero.title_lines');
    if (heroTitle && Array.isArray(heroLines) && heroLines.length) {
      heroTitle.innerHTML = heroLines
        .map((t, i) => {
          const cls = i === heroLines.length - 1 ? 'hero-title-accent' : '';
          return `<span${cls ? ` class="${cls}"` : ''}>${escapeHtml(t)}</span>`;
        })
        .join('');
    }

    // Donate title (accent + suffix).
    const donateTitle = document.getElementById('donate-title');
    const donateAccent = getNested(content, 'donate.title_accent');
    const donateSuffix = getNested(content, 'donate.title_suffix');
    if (donateTitle && (donateAccent != null || donateSuffix != null)) {
      donateTitle.innerHTML =
        `<span class="gold">${escapeHtml(donateAccent ?? '')}</span>` +
        `<span>${escapeHtml(donateSuffix ?? '')}</span>`;
    }

    // Hero stats list.
    const heroStats = document.getElementById('hero-stats');
    const stats = getNested(content, 'hero.stats');
    if (heroStats && Array.isArray(stats) && stats.length) {
      heroStats.innerHTML = stats
        .map((s) => `<div class="stat"><div class="stat-n">${escapeHtml(s.n)}</div><div class="stat-l">${escapeHtml(s.l)}</div></div>`)
        .join('');
    }

    // Story items.
    const storyGrid = document.getElementById('story-grid');
    const storyItems = getNested(content, 'story.items');
    if (storyGrid && Array.isArray(storyItems) && storyItems.length) {
      storyGrid.innerHTML = storyItems
        .map((it) => `
          <article class="story-item">
            <div class="story-lead">${escapeHtml(it.lead)}</div>
            <p>${escapeHtml(it.body)}</p>
          </article>`)
        .join('');
    }

    // Donate pillars.
    const pillarsEl = document.getElementById('donate-pillars');
    const pillars = getNested(content, 'donate.pillars');
    if (pillarsEl && Array.isArray(pillars) && pillars.length) {
      pillarsEl.innerHTML = pillars
        .map((p) => `<div class="pillar"><div class="pillar-k">${escapeHtml(p.k)}</div><div class="pillar-v">${escapeHtml(p.v)}</div></div>`)
        .join('');
    }

    // Donate amounts.
    const amtsEl = document.getElementById('donate-amounts');
    const amounts = getNested(content, 'donate.amounts');
    if (amtsEl && Array.isArray(amounts) && amounts.length) {
      amtsEl.innerHTML = amounts
        .map((a) => {
          const isPremium = !!a.premium;
          const isDefault = !!a.default;
          const cls = ['donate-amt'];
          if (isPremium) cls.push('is-premium');
          if (isDefault) cls.push('is-selected');
          const tag = a.tag ? `<span class="premium-tag">${escapeHtml(a.tag)}</span>` : '';
          const amt = Number(a.amt) || 0;
          return `<button type="button" class="${cls.join(' ')}" data-amt="${amt}">${tag}<span class="amt">$${amt}</span></button>`;
        })
        .join('');
    }

    // Social grid.
    const socialGrid = document.getElementById('social-grid');
    const socialLinks = getNested(content, 'social.links');
    if (socialGrid && Array.isArray(socialLinks) && socialLinks.length) {
      socialGrid.innerHTML = socialLinks
        .map((s) => {
          const external = s.url && s.url.startsWith('http');
          const targetAttrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
          return `<a href="${escapeHtml(s.url || '#')}" class="social"${targetAttrs}>
            <div class="social-sym">${escapeHtml(s.sym)}</div>
            <div class="social-name">${escapeHtml(s.name)}</div>
            <div class="social-handle">${escapeHtml(s.handle)}</div>
            <div class="social-role">${escapeHtml(s.role)}</div>
          </a>`;
        })
        .join('');
    }

    // Footer links.
    const footerLinks = document.getElementById('footer-links');
    const fLinks = getNested(content, 'footer.links');
    if (footerLinks && Array.isArray(fLinks) && fLinks.length) {
      footerLinks.innerHTML = fLinks
        .map((l) => `<a href="${escapeHtml(l.url || '#')}">${escapeHtml(l.label)}</a>`)
        .join('');
    }

    // Thanks page pillars.
    const thanksPillars = document.getElementById('thanks-pillars');
    const tPillars = getNested(content, 'thanks.pillars');
    if (thanksPillars && Array.isArray(tPillars) && tPillars.length) {
      thanksPillars.innerHTML = tPillars
        .map((p) => `<div class="thanks-pillar"><div class="thanks-pillar-k">${escapeHtml(p.k)}</div><div class="thanks-pillar-v">${escapeHtml(p.v)}</div></div>`)
        .join('');
    }

    // Urgency banner toggle.
    const urgency = document.getElementById('urgency-banner');
    if (urgency && getNested(content, 'urgency.enabled') === true) {
      urgency.hidden = false;
    }
  }

  function loadContentSync() {
    try {
      const cached = sessionStorage.getItem(CONTENT_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  }

  async function loadContent() {
    try {
      const res = await fetch('/api/content', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      try { sessionStorage.setItem(CONTENT_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
      return data;
    } catch (e) {
      return null;
    }
  }

  // Apply cached content immediately (synchronous, prevents FOUC on returning visits).
  const cached = loadContentSync();
  if (cached) applyContent(cached);

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
      if (n > count) count = n;
      renderCounter();
      if (!counterRevealed && heroCounter && petitionCounter) {
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

  // ── Countdown ──────────────────────────────────────────────────
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

  if (countdownEl) {
    const deadline = readDeadline();
    const tick = () => {
      let ms = deadline - Date.now();
      if (ms < 0) ms = 0;
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      countdownEl.textContent = `${pad2(d)}d : ${pad2(h)}h : ${pad2(m)}m : ${pad2(s)}s`;
    };
    tick();
    setInterval(tick, 1000);
  }

  // ── Sticky CTA reveal ──────────────────────────────────────────
  const stickyCta = document.getElementById('sticky-cta');

  function updateSticky() {
    if (!stickyCta) return;
    stickyCta.hidden = !(window.scrollY > 720);
  }

  window.addEventListener('scroll', updateSticky, { passive: true });
  updateSticky();

  // ── Petition form ──────────────────────────────────────────────
  const form = document.getElementById('petition-form');
  const errEl = document.getElementById('petition-error');
  const success = document.getElementById('petition-success');
  const successName = document.getElementById('success-first-name');

  const showError = (msg) => {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.hidden = false;
  };
  const clearError = () => {
    if (!errEl) return;
    errEl.textContent = '';
    errEl.hidden = true;
  };

  if (form) {
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
        if (successName) successName.textContent = first;
        form.hidden = true;
        if (success) success.hidden = false;
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
  }

  // ── Donate grid (re-bindable so CMS re-render works) ───────────
  const donateCustomRow = document.getElementById('donate-custom-row');
  const donateCustomInput = document.getElementById('donate-custom-input');
  const donateSubmit = document.getElementById('donate-submit');
  const donateThanks = document.getElementById('donate-thanks');
  const donateToggleBtns = document.querySelectorAll('.donate-toggle-btn');

  let selectedAmount = 65;
  let isCustom = false;
  let isMonthly = false;

  function pickDefaultAmount() {
    const btns = document.querySelectorAll('.donate-amt');
    const sel = document.querySelector('.donate-amt.is-selected');
    if (sel) {
      selectedAmount = Number(sel.getAttribute('data-amt')) || 65;
    } else if (btns.length) {
      // Default to the middle-ish button if none marked selected.
      const idx = Math.min(1, btns.length - 1);
      btns[idx].classList.add('is-selected');
      selectedAmount = Number(btns[idx].getAttribute('data-amt')) || 65;
    }
  }

  function updateDonateUI() {
    document.querySelectorAll('.donate-amt').forEach((btn) => {
      const isSel = !isCustom && Number(btn.getAttribute('data-amt')) === selectedAmount;
      btn.classList.toggle('is-selected', isSel);
    });
    if (donateCustomRow) donateCustomRow.classList.toggle('is-selected', isCustom);

    const amount = isCustom ? Number(donateCustomInput && donateCustomInput.value) || 0 : selectedAmount;
    const valid = amount >= 1;
    if (donateSubmit) {
      donateSubmit.disabled = !valid;
      donateSubmit.textContent = `DONATE $${amount || 0}${isMonthly ? ' / MONTH' : ''} →`;
    }
  }

  function bindDonateAmtBtns() {
    document.querySelectorAll('.donate-amt').forEach((btn) => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        isCustom = false;
        selectedAmount = Number(btn.getAttribute('data-amt')) || 65;
        if (donateCustomInput) donateCustomInput.value = '';
        updateDonateUI();
      });
    });
  }

  bindDonateAmtBtns();
  pickDefaultAmount();

  if (donateCustomRow && donateCustomInput) {
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
  }

  donateToggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      isMonthly = btn.getAttribute('data-monthly') === 'true';
      donateToggleBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
      updateDonateUI();
    });
  });

  if (donateSubmit) {
    donateSubmit.addEventListener('click', async () => {
      if (donateSubmit.disabled) return;
      const amount = isCustom ? Number(donateCustomInput && donateCustomInput.value) || 0 : selectedAmount;
      if (!amount || amount < 1) return;

      donateSubmit.disabled = true;
      const original = donateSubmit.textContent;
      donateSubmit.textContent = 'REDIRECTING…';
      if (donateThanks) donateThanks.hidden = true;

      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ amount, monthly: isMonthly }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.url) {
          throw new Error(out.error || `Checkout failed (${res.status})`);
        }
        window.location.href = out.url;
      } catch (err) {
        donateSubmit.textContent = original;
        donateSubmit.disabled = false;
        if (donateThanks) {
          donateThanks.textContent = err.message || 'Something went wrong. Please try again.';
          donateThanks.hidden = false;
        }
      }
    });
  }

  updateDonateUI();

  // ── Apply fresh CMS content (overrides cache, re-renders lists) ──
  loadContent().then((content) => {
    if (!content) return;
    applyContent(content);
    // Re-bind donate buttons after re-render.
    bindDonateAmtBtns();
    pickDefaultAmount();
    updateDonateUI();
  });
})();
