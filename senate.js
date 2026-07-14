// senate.js — Hayden McDougall for U.S. Senate landing.
// Vanilla interactivity ported from Campaign Site.dc.html:
// sticky header shrink, IntersectionObserver reveals + counter tick,
// form validation (hero mini-form + full signup), Nucleus proxy POST,
// share-link builders, mobile sticky CTA, honeypot, feature-flagged
// donation module.

(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────
  const BASE_SUPPORTERS = 12438;
  const PAGE_URL = 'https://www.betazuck.com/senate';
  const SHARE_HEADLINE = "South Carolina, it's our turn.";

  // Enable via ?donate=1 query param or by flipping the const.
  const params = new URLSearchParams(location.search);
  const DONATION_ENABLED = params.get('donate') === '1';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── State ──────────────────────────────────────────────────────
  const localSignupsKey = 'hm_signups';
  const state = { submitted: false, firstName: '' };

  function getCount() {
    try {
      return BASE_SUPPORTERS + JSON.parse(localStorage.getItem(localSignupsKey) || '[]').length;
    } catch (e) {
      return BASE_SUPPORTERS;
    }
  }

  function storeSignup(record) {
    try {
      const list = JSON.parse(localStorage.getItem(localSignupsKey) || '[]');
      list.push(record);
      localStorage.setItem(localSignupsKey, JSON.stringify(list));
    } catch (e) {}
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'signup_complete', form: record.source });
    } catch (e) {}
  }

  // ── Sticky header ──────────────────────────────────────────────
  const header = document.getElementById('site-header');
  function onScroll() {
    const on = window.scrollY > 40;
    header.style.background = on ? 'rgba(10,16,32,0.9)' : 'transparent';
    header.style.backdropFilter = on ? 'blur(12px)' : 'none';
    header.style.webkitBackdropFilter = on ? 'blur(12px)' : 'none';
    header.style.padding = on ? '10px 24px' : '18px 24px';
    header.style.boxShadow = on ? '0 2px 24px rgba(0,0,0,0.4)' : 'none';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── Mobile sticky bar ──────────────────────────────────────────
  const stickyBar = document.getElementById('sticky-bar');
  function updateSticky() {
    const isMobile = window.innerWidth < 720;
    stickyBar.hidden = !(isMobile && !state.submitted);
  }
  window.addEventListener('resize', updateSticky);
  updateSticky();

  // ── Scroll reveals + counters ──────────────────────────────────
  const revealDuration = reduced ? 0 : 650;
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      revealIO.unobserve(en.target);
      en.target.animate(
        [{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'none' }],
        { duration: revealDuration, easing: 'cubic-bezier(0.2,0.7,0.3,1)', fill: 'forwards' }
      );
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('[data-reveal]').forEach((el) => revealIO.observe(el));

  const heroCountEl = document.getElementById('hero-count');
  const bigCountEl  = document.getElementById('big-count');

  function tickCounter(el) {
    const target = getCount();
    if (reduced) { el.textContent = target.toLocaleString(); return; }
    const t0 = performance.now(), D = 1600;
    function step(t) {
      const p = Math.min((t - t0) / D, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * e).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const counterIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      counterIO.unobserve(en.target);
      tickCounter(en.target);
    });
  }, { threshold: 0.4 });
  [heroCountEl, bigCountEl].forEach((el) => el && counterIO.observe(el));

  // ── Validation ─────────────────────────────────────────────────
  const validators = {
    first:  (v) => v.trim() ? null : 'We need your first name.',
    last:   (v) => v.trim() ? null : 'And your last name.',
    email:  (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : 'That email doesn’t look right yet.',
    mobile: (v) => {
      const raw = v.replace(/[^\d+]/g, '');
      const digits = raw.replace(/\D/g, '');
      if (raw.startsWith('+')) {
        return digits.length >= 8 && digits.length <= 15 ? null : 'International numbers need 8–15 digits.';
      }
      return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))
        ? null : 'U.S. mobiles are 10 digits — (803) 555-0147.';
    },
  };

  function toE164(v) {
    const raw = v.replace(/[^\d+]/g, '');
    if (raw.startsWith('+')) return '+' + raw.replace(/\D/g, '');
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    return '+1' + (digits.length === 11 ? digits.slice(1) : digits);
  }

  // ── Share link builders ────────────────────────────────────────
  function refreshShareLinks() {
    const text = encodeURIComponent('I just joined the movement. ' + SHARE_HEADLINE + ' ' + PAGE_URL);
    document.querySelectorAll('a.share-x').forEach((a) => a.href = 'https://twitter.com/intent/tweet?text=' + text);
    document.querySelectorAll('a.share-fb').forEach((a) => a.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(PAGE_URL));
    document.querySelectorAll('a.share-wa').forEach((a) => a.href = 'https://wa.me/?text=' + text);
  }
  refreshShareLinks();

  document.querySelectorAll('button.share-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(PAGE_URL);
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = PAGE_URL;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
      }
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 2000);
    });
  });

  // ── Form submission ────────────────────────────────────────────
  function setError(scope, field, message) {
    const el = scope.querySelector(`[data-error-for="${field}"]`);
    if (!el) return;
    if (message) { el.textContent = message; el.hidden = false; }
    else { el.textContent = ''; el.hidden = true; }
  }

  async function submitToBackend(record) {
    try {
      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          form: 'senate',
          first_name: record.first,
          last_name: record.last || '',
          email: record.email,
          phone: record.mobile_e164,
          zip: record.zip || '',
          source: record.source,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.ok === false) throw new Error(out.error || `Submission failed (${res.status})`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || 'Network error' };
    }
  }

  function enterSuccess(firstName) {
    state.submitted = true;
    state.firstName = firstName;
    document.querySelectorAll('[data-first-name]').forEach((el) => el.textContent = firstName);
    document.querySelectorAll('[data-count-display]').forEach((el) => el.textContent = getCount().toLocaleString());

    // Hero: hide form, show success block
    const heroForm = document.getElementById('hero-form');
    const heroSuccess = document.getElementById('hero-success');
    if (heroForm) heroForm.style.display = 'none';
    if (heroSuccess) heroSuccess.style.display = 'block';

    // Full signup: hide form wrapper, show success
    const fullWrap = document.getElementById('full-form-wrap');
    const fullSuccess = document.getElementById('full-form-success');
    if (fullWrap) fullWrap.style.display = 'none';
    if (fullSuccess) fullSuccess.style.display = 'block';

    if (heroCountEl) heroCountEl.textContent = getCount().toLocaleString();
    if (bigCountEl)  bigCountEl.textContent = getCount().toLocaleString();

    updateSticky();
    refreshShareLinks();
  }

  function wireForm(formEl, requiredFields, source, errorTargetSelector) {
    if (!formEl) return;
    // Inline blur validation
    requiredFields.forEach((k) => {
      const input = formEl.querySelector(`[name="${k}"]`);
      if (!input) return;
      input.addEventListener('blur', () => {
        const err = validators[k] && validators[k](input.value);
        setError(formEl, k, err);
      });
      input.addEventListener('input', () => setError(formEl, k, null));
    });

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(formEl);
      // Honeypot
      if (String(data.get('website') || '').trim()) return;

      const record = {
        first:  String(data.get('first')  || '').trim(),
        last:   String(data.get('last')   || '').trim(),
        email:  String(data.get('email')  || '').trim(),
        mobile: String(data.get('mobile') || '').trim(),
        zip:    String(data.get('zip')    || '').trim(),
      };

      let hasError = false;
      requiredFields.forEach((k) => {
        const err = validators[k] && validators[k](record[k] || '');
        setError(formEl, k, err);
        if (err) hasError = true;
      });

      // Hero mini-form pools all errors into one line
      if (errorTargetSelector) {
        const target = document.querySelector(errorTargetSelector);
        if (target) {
          const firstErr = requiredFields.map((k) => validators[k] && validators[k](record[k] || '')).find(Boolean);
          if (firstErr) { target.textContent = firstErr; target.hidden = false; hasError = true; }
          else { target.textContent = ''; target.hidden = true; }
        }
      }

      if (hasError) return;

      const submitBtn = formEl.querySelector('button[type="submit"]');
      const originalLabel = submitBtn ? submitBtn.textContent : null;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }

      const payload = {
        first: record.first, last: record.last, email: record.email,
        mobile_e164: toE164(record.mobile), zip: record.zip,
        ts: new Date().toISOString(), source,
      };

      const result = await submitToBackend(payload);
      if (!result.ok) {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel || 'Count me in'; }
        const inlineErr = errorTargetSelector ? document.querySelector(errorTargetSelector) : formEl.querySelector('.field-error');
        if (inlineErr) { inlineErr.textContent = result.error; inlineErr.hidden = false; }
        return;
      }

      storeSignup(payload);
      enterSuccess(record.first || 'friend');
    });
  }

  wireForm(document.getElementById('hero-form'), ['first', 'email', 'mobile'], 'landing_v1_hero', '#hero-error');
  wireForm(document.getElementById('full-form'), ['first', 'last', 'email', 'mobile'], 'landing_v1', null);

  // ── Donation (feature-flagged) ─────────────────────────────────
  const donateSection = document.getElementById('donate');
  if (DONATION_ENABLED) {
    donateSection.hidden = false;

    let recurring = false;
    let tier = 25;
    let custom = '';

    const oneTimeBtn = document.getElementById('donate-onetime');
    const monthlyBtn = document.getElementById('donate-monthly');
    const tierBtns   = document.querySelectorAll('.donate-tier');
    const customEl   = document.getElementById('donate-custom');
    const submitBtn  = document.getElementById('donate-submit');

    function renderDonate() {
      const activeAmount = custom ? Number(custom) || 0 : tier;
      submitBtn.textContent = 'Donate $' + activeAmount + (recurring ? ' / month' : '');
      oneTimeBtn.style.background = recurring ? 'transparent' : '#FF5A36';
      oneTimeBtn.style.color = recurring ? 'rgba(243,241,236,0.7)' : '#0A1020';
      monthlyBtn.style.background = recurring ? '#FF5A36' : 'transparent';
      monthlyBtn.style.color = recurring ? '#0A1020' : 'rgba(243,241,236,0.7)';
      tierBtns.forEach((b) => {
        const active = !custom && Number(b.dataset.amt) === tier;
        b.style.borderColor = active ? '#FF5A36' : 'rgba(243,241,236,0.18)';
        b.style.background  = active ? 'rgba(255,90,54,0.15)' : 'rgba(10,16,32,0.6)';
      });
    }

    oneTimeBtn.addEventListener('click', () => { recurring = false; renderDonate(); });
    monthlyBtn.addEventListener('click', () => { recurring = true; renderDonate(); });
    tierBtns.forEach((b) => b.addEventListener('click', () => { tier = Number(b.dataset.amt); custom = ''; customEl.value = ''; renderDonate(); }));
    customEl.addEventListener('input', () => { custom = customEl.value.replace(/[^\d.]/g, ''); customEl.value = custom; renderDonate(); });
    submitBtn.addEventListener('click', () => {
      alert('[ Payment processor integration point — Stripe / Anedot / WinRed. Not wired. ]');
    });

    renderDonate();
  }
})();
