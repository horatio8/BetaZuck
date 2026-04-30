// βetaZuck CMS — single-page admin editor.
// Auth: password stored in localStorage as a Bearer token. /api/content
// PUT and /api/upload POST verify it.
(function () {
  'use strict';

  const PW_KEY = 'cms_pw';
  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── Schema describing every editable field ─────────────────────
  const SCHEMA = [
    {
      id: 'site',
      title: 'Site & SEO',
      fields: [
        { key: 'site.title',           label: 'Browser tab title',          type: 'text' },
        { key: 'site.description',     label: 'Meta description',           type: 'textarea' },
        { key: 'site.og_title',        label: 'Social share title (OG)',    type: 'text' },
        { key: 'site.og_description',  label: 'Social share description (OG)', type: 'textarea' },
        { key: 'site.og_image_url',    label: 'Social share image (1200×630 PNG/JPG)', type: 'image' },
        { key: 'site.twitter_handle',  label: 'Twitter / X handle',         type: 'text' },
      ],
    },
    {
      id: 'urgency',
      title: 'Urgency Banner',
      fields: [
        { key: 'urgency.enabled', label: 'Show banner above the nav', type: 'checkbox' },
        { key: 'urgency.lead',    label: 'Banner text (countdown is appended)', type: 'text' },
      ],
    },
    {
      id: 'nav',
      title: 'Nav',
      fields: [
        { key: 'nav.donate_label', label: 'Donate button label', type: 'text' },
        { key: 'nav.sign_label',   label: 'Sign button label',   type: 'text' },
      ],
    },
    {
      id: 'hero',
      title: 'Hero',
      fields: [
        { key: 'hero.badge_text',          label: 'Badge text (above the headline)', type: 'text' },
        {
          key: 'hero.title_lines',
          label: 'Headline lines (last line is the red accent)',
          type: 'list',
          item_fields: [{ key: '', label: 'Line', type: 'text' }],
          item_is_scalar: true,
        },
        { key: 'hero.subtitle_html',       label: 'Subtitle (inline HTML allowed: <strong>)', type: 'textarea' },
        { key: 'hero.cta_primary_label',   label: 'Primary CTA button',   type: 'text' },
        { key: 'hero.cta_secondary_label', label: 'Secondary CTA button', type: 'text' },
        { key: 'hero.image_url',           label: 'Hero image',           type: 'image' },
        {
          key: 'hero.stats',
          label: 'Stats row',
          type: 'list',
          item_fields: [
            { key: 'n', label: 'Number',  type: 'text' },
            { key: 'l', label: 'Label',   type: 'text' },
          ],
        },
        { key: 'hero.counter_label', label: 'Live counter caption', type: 'text' },
      ],
    },
    {
      id: 'story',
      title: 'Story',
      fields: [
        { key: 'story.eyebrow', label: 'Eyebrow', type: 'text' },
        { key: 'story.title',   label: 'Section title', type: 'text' },
        {
          key: 'story.items',
          label: 'Story panels',
          type: 'list',
          item_fields: [
            { key: 'lead', label: 'Lead',  type: 'text' },
            { key: 'body', label: 'Body',  type: 'textarea' },
          ],
        },
      ],
    },
    {
      id: 'petition',
      title: 'Petition',
      fields: [
        { key: 'petition.eyebrow',                label: 'Eyebrow', type: 'text' },
        { key: 'petition.title_line1',            label: 'Title line 1', type: 'text' },
        { key: 'petition.title_line2',            label: 'Title line 2', type: 'text' },
        { key: 'petition.lede',                   label: 'Lede',         type: 'textarea' },
        { key: 'petition.counter_label',          label: 'Counter caption', type: 'text' },
        { key: 'petition.submit_label',           label: 'Submit button', type: 'text' },
        { key: 'petition.success_eyebrow',        label: 'Success eyebrow', type: 'text' },
        { key: 'petition.success_title_prefix',   label: 'Success title prefix (name follows)', type: 'text' },
        { key: 'petition.success_body',           label: 'Success body', type: 'textarea' },
      ],
    },
    {
      id: 'donate',
      title: 'Donate',
      fields: [
        { key: 'donate.eyebrow',              label: 'Eyebrow', type: 'text' },
        { key: 'donate.title_accent',         label: 'Title accent (gold)', type: 'text' },
        { key: 'donate.title_suffix',         label: 'Title remainder',     type: 'text' },
        { key: 'donate.lede_html',            label: 'Lede (inline HTML allowed)', type: 'textarea' },
        {
          key: 'donate.pillars',
          label: 'Pillars (4 typically)',
          type: 'list',
          item_fields: [
            { key: 'k', label: 'Title', type: 'text' },
            { key: 'v', label: 'Body',  type: 'text' },
          ],
        },
        {
          key: 'donate.amounts',
          label: 'Preset donation amounts',
          type: 'list',
          item_fields: [
            { key: 'amt',     label: 'Amount (USD)', type: 'number' },
            { key: 'tag',     label: 'Tag (e.g. PATRIOT, HERO; leave blank for none)', type: 'text' },
            { key: 'premium', label: 'Premium style', type: 'checkbox' },
            { key: 'default', label: 'Default selected', type: 'checkbox' },
          ],
        },
        { key: 'donate.toggle_onetime_label', label: 'One-time toggle label', type: 'text' },
        { key: 'donate.toggle_monthly_label', label: 'Monthly toggle label', type: 'text' },
        { key: 'donate.custom_label',         label: 'Custom amount label', type: 'text' },
        { key: 'donate.submit_label_prefix',  label: 'Donate button prefix (amount + frequency append)', type: 'text' },
        { key: 'donate.meta',                 label: 'Disclaimer line', type: 'text' },
      ],
    },
    {
      id: 'social',
      title: 'Social',
      fields: [
        { key: 'social.eyebrow', label: 'Eyebrow', type: 'text' },
        { key: 'social.title',   label: 'Title', type: 'text' },
        {
          key: 'social.links',
          label: 'Channel cards',
          type: 'list',
          item_fields: [
            { key: 'sym',    label: 'Symbol / icon char (e.g. f, IG, X, ✉)', type: 'text' },
            { key: 'name',   label: 'Channel name', type: 'text' },
            { key: 'handle', label: 'Handle / path', type: 'text' },
            { key: 'role',   label: 'Role / one-liner', type: 'text' },
            { key: 'url',    label: 'URL (or anchor like #petition)', type: 'text' },
          ],
        },
      ],
    },
    {
      id: 'footer',
      title: 'Footer',
      fields: [
        { key: 'footer.copyright', label: 'Copyright line', type: 'text' },
        {
          key: 'footer.links',
          label: 'Footer links',
          type: 'list',
          item_fields: [
            { key: 'label', label: 'Label', type: 'text' },
            { key: 'url',   label: 'URL',   type: 'text' },
          ],
        },
      ],
    },
    {
      id: 'thanks',
      title: '/thanks page',
      fields: [
        { key: 'thanks.badge',         label: 'Badge text', type: 'text' },
        { key: 'thanks.title_line1',   label: 'Title line 1', type: 'text' },
        { key: 'thanks.title_line2',   label: 'Title line 2', type: 'text' },
        { key: 'thanks.lede',          label: 'Lede',  type: 'textarea' },
        { key: 'thanks.body',          label: 'Body (under lede)', type: 'textarea' },
        {
          key: 'thanks.pillars',
          label: 'Pillars',
          type: 'list',
          item_fields: [
            { key: 'k', label: 'Title', type: 'text' },
            { key: 'v', label: 'Body',  type: 'text' },
          ],
        },
        { key: 'thanks.share_body',    label: 'Share-this paragraph', type: 'textarea' },
        { key: 'thanks.cta_label',     label: 'Back-to-home CTA label', type: 'text' },
      ],
    },
    {
      id: 'counter',
      title: 'Counter',
      fields: [
        { key: 'counter.baseline', label: 'Off-platform baseline (added to live signups)', type: 'number' },
      ],
    },
  ];

  // ── Path helpers ───────────────────────────────────────────────
  function getPath(obj, path) {
    if (!path) return obj;
    return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const parts = String(path).split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
    return obj;
  }

  // ── Auth ───────────────────────────────────────────────────────
  function getPw() {
    try { return localStorage.getItem(PW_KEY) || ''; } catch (e) { return ''; }
  }
  function setPw(pw) {
    try { localStorage.setItem(PW_KEY, pw); } catch (e) {}
  }
  function clearPw() {
    try { localStorage.removeItem(PW_KEY); } catch (e) {}
  }

  // ── Login ──────────────────────────────────────────────────────
  const loginScreen = document.getElementById('cms-login');
  const appScreen = document.getElementById('cms-app');
  const logoutBtn = document.getElementById('cms-logout');
  const loginForm = document.getElementById('cms-login-form');
  const loginPw = document.getElementById('cms-login-pw');
  const loginError = document.getElementById('cms-login-error');

  function showLogin(msg) {
    loginScreen.hidden = false;
    appScreen.hidden = true;
    logoutBtn.hidden = true;
    if (msg) {
      loginError.textContent = msg;
      loginError.hidden = false;
    } else {
      loginError.hidden = true;
    }
    setTimeout(() => loginPw && loginPw.focus(), 0);
  }
  function showApp() {
    loginScreen.hidden = true;
    appScreen.hidden = false;
    logoutBtn.hidden = false;
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = (loginPw.value || '').trim();
    if (!pw) return;
    setPw(pw);
    loginError.hidden = true;
    try {
      // Verify by attempting an auth'd round-trip with the current content.
      const ok = await verifyAuth();
      if (!ok) {
        clearPw();
        showLogin('Wrong password.');
        return;
      }
      await boot();
    } catch (err) {
      showLogin('Could not reach the server.');
    }
  });

  logoutBtn.addEventListener('click', () => {
    clearPw();
    location.reload();
  });

  async function verifyAuth() {
    // Round-trip: GET current content (always public), then PUT the same
    // back. If PUT returns 200, the password is correct.
    const cur = await fetch('/api/content', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}));
    const res = await fetch('/api/content', {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${getPw()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(cur || {}),
    });
    return res.ok;
  }

  // ── Editor render ──────────────────────────────────────────────
  let originalContent = {};
  let workingContent = {};

  const tabsEl = document.getElementById('cms-tabs');
  const sectionsEl = document.getElementById('cms-sections');
  const statusEl = document.getElementById('cms-status');
  const saveBtn = document.getElementById('cms-save');
  const discardBtn = document.getElementById('cms-discard');
  const cmsForm = document.getElementById('cms-form');

  function renderTabs() {
    tabsEl.innerHTML = SCHEMA.map(
      (s, i) => `<button type="button" class="cms-tab${i === 0 ? ' is-active' : ''}" data-section="${s.id}" role="tab">${escapeHtml(s.title)}</button>`,
    ).join('');
    tabsEl.querySelectorAll('.cms-tab').forEach((t) => {
      t.addEventListener('click', () => {
        tabsEl.querySelectorAll('.cms-tab').forEach((b) => b.classList.toggle('is-active', b === t));
        sectionsEl.querySelectorAll('.cms-section').forEach((sec) => {
          sec.hidden = sec.dataset.section !== t.dataset.section;
        });
      });
    });
  }

  function renderField(field, value, pathPrefix) {
    const path = pathPrefix ? `${pathPrefix}.${field.key}` : field.key;
    const id = `f_${path.replace(/\./g, '_').replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const safeLabel = escapeHtml(field.label || field.key);

    if (field.type === 'text' || field.type === 'number') {
      const v = value == null ? '' : value;
      return `
        <label class="cms-field">
          <span class="cms-field-label">${safeLabel}</span>
          <input id="${id}" type="${field.type}" data-cms-path="${escapeHtml(path)}" value="${escapeHtml(v)}" />
        </label>`;
    }
    if (field.type === 'textarea') {
      const v = value == null ? '' : value;
      return `
        <label class="cms-field">
          <span class="cms-field-label">${safeLabel}</span>
          <textarea id="${id}" rows="3" data-cms-path="${escapeHtml(path)}">${escapeHtml(v)}</textarea>
        </label>`;
    }
    if (field.type === 'checkbox') {
      const checked = value === true ? 'checked' : '';
      return `
        <label class="cms-field cms-field-check">
          <input id="${id}" type="checkbox" data-cms-path="${escapeHtml(path)}" ${checked} />
          <span class="cms-field-label">${safeLabel}</span>
        </label>`;
    }
    if (field.type === 'image') {
      const v = value == null ? '' : value;
      return `
        <div class="cms-field cms-field-image">
          <span class="cms-field-label">${safeLabel}</span>
          <div class="cms-image-row">
            <div class="cms-image-preview">${v ? `<img src="${escapeHtml(v)}" alt="" />` : '<span class="cms-empty">No image</span>'}</div>
            <div class="cms-image-controls">
              <input type="text" data-cms-path="${escapeHtml(path)}" value="${escapeHtml(v)}" placeholder="https://… or /hero.jpg" />
              <label class="btn btn-outline-red cms-upload">
                UPLOAD
                <input type="file" accept="image/*" data-cms-upload-for="${escapeHtml(path)}" hidden />
              </label>
            </div>
          </div>
        </div>`;
    }
    if (field.type === 'list') {
      const items = Array.isArray(value) ? value : [];
      const itemsHtml = items
        .map((item, idx) => renderListItem(field, item, path, idx))
        .join('');
      return `
        <div class="cms-field cms-field-list" data-cms-list-path="${escapeHtml(path)}">
          <span class="cms-field-label">${safeLabel}</span>
          <div class="cms-list-items">${itemsHtml}</div>
          <button type="button" class="btn btn-outline-red cms-list-add" data-cms-list-add="${escapeHtml(path)}">+ ADD ITEM</button>
        </div>`;
    }
    return '';
  }

  function renderListItem(field, item, listPath, idx) {
    const fields = field.item_fields || [];
    const isScalar = !!field.item_is_scalar;
    const itemPath = `${listPath}.${idx}`;
    const inner = isScalar
      ? renderField({ ...fields[0], key: '' }, item, itemPath).replace(`data-cms-path="${itemPath}"`, `data-cms-path="${itemPath}"`)
      : fields.map((f) => renderField(f, item ? item[f.key] : undefined, itemPath)).join('');
    return `
      <div class="cms-list-item" data-cms-list-item-idx="${idx}">
        <div class="cms-list-item-head">
          <span class="cms-list-item-num">#${idx + 1}</span>
          <div class="cms-list-item-actions">
            <button type="button" class="cms-icon-btn" title="Move up"   data-cms-list-move="up"     data-cms-list-target="${escapeHtml(listPath)}" data-cms-list-idx="${idx}">▲</button>
            <button type="button" class="cms-icon-btn" title="Move down" data-cms-list-move="down"   data-cms-list-target="${escapeHtml(listPath)}" data-cms-list-idx="${idx}">▼</button>
            <button type="button" class="cms-icon-btn cms-icon-btn-danger" title="Remove" data-cms-list-remove data-cms-list-target="${escapeHtml(listPath)}" data-cms-list-idx="${idx}">✕</button>
          </div>
        </div>
        ${inner}
      </div>`;
  }

  function renderEditor() {
    sectionsEl.innerHTML = SCHEMA.map((section, i) => {
      const fieldsHtml = section.fields
        .map((f) => renderField(f, getPath(workingContent, f.key)))
        .join('');
      return `
        <section class="cms-section" data-section="${section.id}"${i === 0 ? '' : ' hidden'}>
          <h2 class="cms-section-title">${escapeHtml(section.title)}</h2>
          ${fieldsHtml}
        </section>`;
    }).join('');
    bindEditorEvents();
  }

  function bindEditorEvents() {
    // Capture text/number/textarea changes back into workingContent.
    sectionsEl.querySelectorAll('input[data-cms-path], textarea[data-cms-path]').forEach((el) => {
      el.addEventListener('input', () => commitField(el));
      el.addEventListener('change', () => commitField(el));
    });

    // Image uploads.
    sectionsEl.querySelectorAll('input[type="file"][data-cms-upload-for]').forEach((el) => {
      el.addEventListener('change', async () => {
        const path = el.getAttribute('data-cms-upload-for');
        const file = el.files && el.files[0];
        if (!file || !path) return;
        await handleUpload(path, file, el);
        el.value = '';
      });
    });

    // List add / remove / reorder.
    sectionsEl.querySelectorAll('[data-cms-list-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const path = btn.getAttribute('data-cms-list-add');
        addListItem(path);
      });
    });
    sectionsEl.querySelectorAll('[data-cms-list-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const path = btn.getAttribute('data-cms-list-target');
        const idx = Number(btn.getAttribute('data-cms-list-idx'));
        removeListItem(path, idx);
      });
    });
    sectionsEl.querySelectorAll('[data-cms-list-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const path = btn.getAttribute('data-cms-list-target');
        const idx = Number(btn.getAttribute('data-cms-list-idx'));
        const dir = btn.getAttribute('data-cms-list-move');
        moveListItem(path, idx, dir === 'up' ? -1 : 1);
      });
    });
  }

  function commitField(el) {
    const path = el.getAttribute('data-cms-path');
    if (!path) return;
    let v;
    if (el.type === 'checkbox') v = !!el.checked;
    else if (el.type === 'number') v = el.value === '' ? null : Number(el.value);
    else v = el.value;
    setPath(workingContent, path, v);
    setStatus('Unsaved changes', 'pending');
  }

  function emptyItemFor(field) {
    if (field.item_is_scalar) return '';
    const out = {};
    (field.item_fields || []).forEach((f) => {
      out[f.key] =
        f.type === 'checkbox' ? false :
        f.type === 'number'   ? 0 :
        '';
    });
    return out;
  }

  function findFieldByPath(path) {
    for (const sec of SCHEMA) {
      for (const f of sec.fields) {
        if (f.key === path) return f;
      }
    }
    return null;
  }

  function addListItem(path) {
    const field = findFieldByPath(path);
    if (!field) return;
    const cur = getPath(workingContent, path);
    const arr = Array.isArray(cur) ? cur.slice() : [];
    arr.push(emptyItemFor(field));
    setPath(workingContent, path, arr);
    renderEditor();
    activateTabForPath(path);
    setStatus('Unsaved changes', 'pending');
  }

  function removeListItem(path, idx) {
    const cur = getPath(workingContent, path);
    if (!Array.isArray(cur)) return;
    const arr = cur.slice();
    arr.splice(idx, 1);
    setPath(workingContent, path, arr);
    renderEditor();
    activateTabForPath(path);
    setStatus('Unsaved changes', 'pending');
  }

  function moveListItem(path, idx, delta) {
    const cur = getPath(workingContent, path);
    if (!Array.isArray(cur)) return;
    const next = idx + delta;
    if (next < 0 || next >= cur.length) return;
    const arr = cur.slice();
    const [item] = arr.splice(idx, 1);
    arr.splice(next, 0, item);
    setPath(workingContent, path, arr);
    renderEditor();
    activateTabForPath(path);
    setStatus('Unsaved changes', 'pending');
  }

  function activateTabForPath(path) {
    const root = String(path).split('.')[0];
    const tab = tabsEl.querySelector(`.cms-tab[data-section="${root}"]`);
    if (tab) tab.click();
  }

  // ── Image upload ───────────────────────────────────────────────
  async function handleUpload(path, file, fileInputEl) {
    setStatus(`Uploading ${file.name}…`, 'pending');
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${getPw()}`,
          'content-type': file.type || 'application/octet-stream',
          'x-file-name': file.name || 'upload',
        },
        body: file,
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.url) {
        throw new Error(out.error || `Upload failed (${res.status})`);
      }
      setPath(workingContent, path, out.url);
      // Update the URL input + preview without a full re-render.
      const input = sectionsEl.querySelector(`input[data-cms-path="${cssEscape(path)}"]`);
      if (input) input.value = out.url;
      const fieldEl = fileInputEl.closest('.cms-field-image');
      if (fieldEl) {
        const preview = fieldEl.querySelector('.cms-image-preview');
        if (preview) preview.innerHTML = `<img src="${escapeHtml(out.url)}" alt="" />`;
      }
      setStatus('Image uploaded · click SAVE to publish', 'pending');
    } catch (err) {
      setStatus(`Upload failed: ${err.message}`, 'error');
    }
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/"/g, '\\"');
  }

  // ── Save ───────────────────────────────────────────────────────
  cmsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    const original = saveBtn.textContent;
    saveBtn.textContent = 'SAVING…';
    setStatus('Saving…', 'pending');
    try {
      const res = await fetch('/api/content', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${getPw()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(workingContent),
      });
      if (res.status === 401) {
        clearPw();
        showLogin('Session expired. Sign in again.');
        return;
      }
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.ok !== true) {
        throw new Error(out.error || `Save failed (${res.status})`);
      }
      originalContent = JSON.parse(JSON.stringify(workingContent));
      setStatus('Saved & published ✓', 'ok');
    } catch (err) {
      setStatus(`Save failed: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = original;
    }
  });

  discardBtn.addEventListener('click', () => {
    if (!confirm('Discard all unsaved changes?')) return;
    workingContent = JSON.parse(JSON.stringify(originalContent));
    renderEditor();
    setStatus('Reverted to last saved state', 'ok');
  });

  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'cms-status' + (kind ? ' is-' + kind : '');
  }

  // ── Boot ───────────────────────────────────────────────────────
  async function boot() {
    showApp();
    setStatus('Loading…', 'pending');
    try {
      const res = await fetch('/api/content', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      // If empty, seed with the schema-implied empty shape.
      originalContent = data && typeof data === 'object' ? data : {};
      workingContent = JSON.parse(JSON.stringify(originalContent));
      renderTabs();
      renderEditor();
      setStatus('Loaded · ready to edit', 'ok');
    } catch (err) {
      setStatus(`Could not load content: ${err.message}`, 'error');
    }
  }

  // Entrypoint.
  if (getPw()) {
    boot().catch(() => showLogin());
  } else {
    showLogin();
  }
})();
