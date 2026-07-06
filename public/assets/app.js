(() => {
  'use strict';

  const el = (id) => document.getElementById(id);
  const rowTemplate = el('routeRowTemplate');
  const logEl = el('log');
  const railNav = el('railNav');
  const filterInput = el('filterInput');
  const copyBaseBtn = el('copyBaseBtn');

  let manifest = null;
  let routes = [];
  let activeGroup = 'all';

  function groupLabel(key) {
    return manifest.groups[key]?.label || key;
  }

  function groupOrder(key) {
    return manifest.groups[key]?.order ?? 99;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // fallback for older/unsupported contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (btn) {
      const original = btn.innerHTML;
      const isIconBtn = btn.querySelector('span');
      btn.classList.add('copied');
      if (isIconBtn) {
        isIconBtn.textContent = 'Tersalin!';
      } else {
        btn.textContent = 'Tersalin!';
      }
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = original;
      }, 1600);
    }
  }

  async function boot() {
    const [manifestRes, routesRes] = await Promise.all([
      fetch('/manifest.json').then((r) => r.json()),
      fetch('/api/routes').then((r) => r.json())
    ]);

    manifest = manifestRes.result;
    routes = routesRes.result;

    el('tagline').textContent = manifest.identity.tagline;
    el('routeCount').textContent = routes.length;
    el('baseUrl').textContent = window.location.origin;
    document.title = manifest.identity.name;

    renderRail();
    renderLog();
  }

  function renderRail() {
    railNav.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'rail-item active';
    allBtn.dataset.group = 'all';
    allBtn.innerHTML = `<span>Semua endpoint</span><span class="count">${routes.length}</span>`;
    railNav.appendChild(allBtn);

    const groups = [...new Set(routes.map((r) => r.group))].sort(
      (a, b) => groupOrder(a) - groupOrder(b)
    );

    groups.forEach((g) => {
      const count = routes.filter((r) => r.group === g).length;
      const btn = document.createElement('button');
      btn.className = 'rail-item';
      btn.dataset.group = g;
      btn.innerHTML = `<span>${groupLabel(g)}</span><span class="count">${count}</span>`;
      railNav.appendChild(btn);
    });

    railNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.rail-item');
      if (!btn) return;
      activeGroup = btn.dataset.group;
      [...railNav.children].forEach((c) => c.classList.toggle('active', c === btn));
      renderLog();
    });
  }

  function renderLog() {
    const term = filterInput.value.trim().toLowerCase();
    logEl.innerHTML = '';

    const groups = [...new Set(routes.map((r) => r.group))].sort(
      (a, b) => groupOrder(a) - groupOrder(b)
    );

    groups.forEach((g) => {
      if (activeGroup !== 'all' && activeGroup !== g) return;

      const items = routes.filter((r) => {
        if (r.group !== g) return false;
        if (!term) return true;
        return r.name.toLowerCase().includes(term) || r.path.toLowerCase().includes(term);
      });

      if (!items.length) return;

      const title = document.createElement('div');
      title.className = 'log-group-title';
      title.textContent = groupLabel(g);
      logEl.appendChild(title);

      items.forEach((route) => logEl.appendChild(buildRow(route)));
    });

    if (!logEl.children.length) {
      const empty = document.createElement('p');
      empty.style.color = 'var(--text-faint)';
      empty.style.fontSize = '14px';
      empty.style.fontWeight = '500';
      empty.textContent = 'Tidak ada endpoint yang cocok dengan pencarian itu.';
      logEl.appendChild(empty);
    }
  }

  function buildRow(route) {
    const node = rowTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.verb').textContent = route.method;
    node.querySelector('.path').textContent = route.path;
    node.querySelector('.name').textContent = route.name;
    node.querySelector('.desc').textContent = route.description;

    const fieldsEl = node.querySelector('.fields');
    const runBtn = node.querySelector('.run-btn');
    const builtUrl = node.querySelector('.built-url');
    const copyEndpointBtn = node.querySelector('.copy-endpoint-btn');
    const timingEl = node.querySelector('.timing');
    const timingMs = node.querySelector('.timing-ms');
    const resultBox = node.querySelector('.result');
    const resultLoading = node.querySelector('.result-loading');
    const resultHead = node.querySelector('.result-head');
    const resultStatus = node.querySelector('.result-status');
    const resultTime = node.querySelector('.result-time');
    const resultSize = node.querySelector('.result-size');
    const copyResultBtn = node.querySelector('.copy-result-btn');
    const resultJson = node.querySelector('.result-json');
    const resultImage = node.querySelector('.result-image');

    let lastResultText = '';
    let currentUrl = '';

    function updateBuiltUrl() {
      const inputs = [...fieldsEl.querySelectorAll('input')];
      const query = new URLSearchParams();
      inputs.forEach((input) => {
        const val = input.value.trim();
        if (val) query.set(input.dataset.key, val);
      });
      const qs = query.toString();
      currentUrl = `${window.location.origin}${route.path}${qs ? `?${qs}` : ''}`;
      builtUrl.textContent = currentUrl;
    }

    route.params.forEach((param) => {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.innerHTML = `<label for="p-${route.path}-${param.key}">${param.key}${param.required ? '' : ' (opsional)'}</label>`;
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `p-${route.path}-${param.key}`;
      input.placeholder = param.hint || '';
      input.dataset.key = param.key;
      input.dataset.required = param.required ? '1' : '0';
      input.addEventListener('input', () => {
        input.classList.remove('invalid');
        updateBuiltUrl();
      });
      wrap.appendChild(input);
      fieldsEl.appendChild(wrap);
    });

    updateBuiltUrl();

    node.querySelector('.row-head').addEventListener('click', () => {
      node.classList.toggle('open');
    });

    copyEndpointBtn.addEventListener('click', () => {
      copyText(currentUrl, copyEndpointBtn);
    });

    copyResultBtn.addEventListener('click', () => {
      copyText(lastResultText, copyResultBtn);
    });

    runBtn.addEventListener('click', async () => {
      const inputs = [...fieldsEl.querySelectorAll('input')];
      let valid = true;

      inputs.forEach((input) => {
        const val = input.value.trim();
        if (input.dataset.required === '1' && !val) {
          valid = false;
          input.classList.add('invalid');
        } else {
          input.classList.remove('invalid');
        }
      });

      if (!valid) return;

      updateBuiltUrl();
      const url = currentUrl;

      resultBox.hidden = false;
      resultLoading.hidden = false;
      resultHead.hidden = true;
      resultJson.hidden = true;
      resultImage.hidden = true;
      runBtn.disabled = true;
      timingEl.hidden = true;

      const startedAt = performance.now();

      try {
        const response = await fetch(url);
        const elapsedMs = Math.round(performance.now() - startedAt);
        const contentType = response.headers.get('Content-Type') || '';

        timingEl.hidden = false;
        timingMs.textContent = `${elapsedMs} ms`;
        timingEl.classList.toggle('slow', elapsedMs > 1500);

        resultStatus.textContent = response.status;
        resultStatus.classList.toggle('err', !response.ok);
        resultTime.textContent = `${elapsedMs} ms`;

        if (contentType.startsWith('image/')) {
          const blob = await response.blob();
          resultSize.textContent = formatBytes(blob.size);
          resultImage.src = URL.createObjectURL(blob);
          resultImage.hidden = false;
          lastResultText = url;
        } else {
          const rawText = await response.text();
          resultSize.textContent = formatBytes(new Blob([rawText]).size);
          let pretty = rawText;
          try {
            pretty = JSON.stringify(JSON.parse(rawText), null, 2);
          } catch (_) { /* not JSON, show as-is */ }
          resultJson.textContent = pretty;
          resultJson.hidden = false;
          lastResultText = pretty;
        }

        resultHead.hidden = false;
      } catch (err) {
        const elapsedMs = Math.round(performance.now() - startedAt);
        timingEl.hidden = false;
        timingMs.textContent = `${elapsedMs} ms`;
        timingEl.classList.add('slow');

        resultHead.hidden = false;
        resultStatus.textContent = 'Gagal';
        resultStatus.classList.add('err');
        resultTime.textContent = `${elapsedMs} ms`;
        resultSize.textContent = '—';

        const message = `Request gagal: ${err.message}`;
        resultJson.textContent = message;
        resultJson.hidden = false;
        lastResultText = message;
      } finally {
        resultLoading.hidden = true;
        runBtn.disabled = false;
      }
    });

    return node;
  }

  filterInput.addEventListener('input', renderLog);

  copyBaseBtn.addEventListener('click', () => {
    copyText(window.location.origin, copyBaseBtn);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== filterInput) {
      e.preventDefault();
      filterInput.focus();
    }
  });

  boot();
})();
