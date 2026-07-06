(() => {
  'use strict';

  const el = (id) => document.getElementById(id);
  const rowTemplate = el('routeRowTemplate');
  const logEl = el('log');
  const railNav = el('railNav');
  const filterInput = el('filterInput');

  let manifest = null;
  let routes = [];
  let activeGroup = 'all';

  function groupLabel(key) {
    return manifest.groups[key]?.label || key;
  }

  function groupOrder(key) {
    return manifest.groups[key]?.order ?? 99;
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
    allBtn.innerHTML = `<span>All routes</span><span class="count">${routes.length}</span>`;
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
      empty.style.fontSize = '13px';
      empty.textContent = 'Nothing matches that filter.';
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
    const resultBox = node.querySelector('.result');
    const resultLoading = node.querySelector('.result-loading');
    const resultJson = node.querySelector('.result-json');
    const resultImage = node.querySelector('.result-image');

    route.params.forEach((param) => {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.innerHTML = `<label for="p-${route.path}-${param.key}">${param.key}${param.required ? '' : ' (optional)'}</label>`;
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `p-${route.path}-${param.key}`;
      input.placeholder = param.hint || '';
      input.dataset.key = param.key;
      input.dataset.required = param.required ? '1' : '0';
      wrap.appendChild(input);
      fieldsEl.appendChild(wrap);
    });

    node.querySelector('.row-head').addEventListener('click', () => {
      node.classList.toggle('open');
    });

    runBtn.addEventListener('click', async () => {
      const inputs = [...fieldsEl.querySelectorAll('input')];
      let valid = true;
      const query = new URLSearchParams();

      inputs.forEach((input) => {
        const val = input.value.trim();
        if (input.dataset.required === '1' && !val) {
          valid = false;
          input.classList.add('invalid');
        } else {
          input.classList.remove('invalid');
          if (val) query.set(input.dataset.key, val);
        }
      });

      if (!valid) return;

      const qs = query.toString();
      const url = `${window.location.origin}${route.path}${qs ? `?${qs}` : ''}`;
      builtUrl.textContent = url;

      resultBox.hidden = false;
      resultLoading.hidden = false;
      resultJson.hidden = true;
      resultImage.hidden = true;
      runBtn.disabled = true;

      try {
        const response = await fetch(url);
        const contentType = response.headers.get('Content-Type') || '';

        if (contentType.startsWith('image/')) {
          const blob = await response.blob();
          resultImage.src = URL.createObjectURL(blob);
          resultImage.hidden = false;
        } else {
          const data = await response.json();
          resultJson.textContent = JSON.stringify(data, null, 2);
          resultJson.hidden = false;
        }
      } catch (err) {
        resultJson.textContent = `Request failed: ${err.message}`;
        resultJson.hidden = false;
      } finally {
        resultLoading.hidden = true;
        runBtn.disabled = false;
      }
    });

    return node;
  }

  filterInput.addEventListener('input', renderLog);

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== filterInput) {
      e.preventDefault();
      filterInput.focus();
    }
  });

  boot();
})();
