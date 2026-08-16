(function () {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;

  let select = null;
  let syncing = false;

  function labelFor(button) {
    const title = button.title || button.textContent || button.dataset.id || 'Effect';
    return title.replace(/\s*\([0-9]\)\s*$/, '').trim();
  }

  function syncSelect() {
    if (!select) return;
    const active = toolbar.querySelector('button[data-id].active, button[data-id][aria-pressed="true"]');
    if (active?.dataset.id && select.value !== active.dataset.id) {
      select.value = active.dataset.id;
    }
  }

  function buildDropdown() {
    if (syncing) return;
    syncing = true;
    try {
      const effectButtons = Array.from(toolbar.querySelectorAll('button[data-id]'));
      if (!effectButtons.length) return;

      for (const button of effectButtons) {
        if (!button.classList.contains('toolbar-effect-source')) {
          button.classList.add('toolbar-effect-source');
          button.tabIndex = -1;
        }
      }

      if (!select) {
        const wrap = document.createElement('label');
        wrap.className = 'effect-select-wrap';
        wrap.setAttribute('for', 'effect-select');

        const caption = document.createElement('span');
        caption.className = 'effect-select-label';
        caption.textContent = 'Effect';

        select = document.createElement('select');
        select.id = 'effect-select';
        select.setAttribute('aria-label', '选择实时视觉效果');

        for (const button of effectButtons) {
          const option = document.createElement('option');
          option.value = button.dataset.id;
          option.textContent = labelFor(button);
          select.appendChild(option);
        }

        select.addEventListener('change', () => {
          const target = toolbar.querySelector(`button[data-id="${CSS.escape(select.value)}"]`);
          target?.click();
          syncSelect();
        });

        wrap.append(caption, select);
        const record = toolbar.querySelector('.record-button');
        if (record) record.insertAdjacentElement('afterend', wrap);
        else toolbar.prepend(wrap);
      }

      syncSelect();
    } finally {
      syncing = false;
    }
  }

  const observer = new MutationObserver(() => {
    if (!toolbar.querySelector('button[data-id]')) return;
    buildDropdown();
    syncSelect();
  });

  observer.observe(toolbar, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-pressed'],
  });

  buildDropdown();
})();
