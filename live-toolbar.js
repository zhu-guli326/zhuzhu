(function () {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;

  const STYLE_ID = 'framelab-fx-picker-v2-style';
  const PICKER_ID = 'framelab-fx-picker-v2';
  let built = false;
  let effectButtons = [];
  let cards = [];
  let picker = null;
  let trigger = null;
  let panel = null;
  let currentName = null;
  let activeIndex = 0;
  let open = false;

  const VISUAL_CLASS = {
    holo: 'fx2-holo',
    funhouse: 'fx2-funhouse',
    triprism: 'fx2-prism',
    negative: 'fx2-negative',
    colornegative: 'fx2-colornegative',
    dot: 'fx2-dot',
    antidot: 'fx2-antidot',
    vangogh: 'fx2-vangogh',
    glitch: 'fx2-glitch',
    neon: 'fx2-neon',
    raster: 'fx2-raster',
    thermal: 'fx2-thermal',
    waveprint: 'fx2-wave',
    retropink: 'fx2-retropink',
    spectrum: 'fx2-spectrum',
  };

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #toolbar { overflow: visible !important; }
      #toolbar .toolbar-effect-source { display: none !important; }
      #toolbar .effect-select-wrap { display: none !important; }

      #toolbar .fx2-wrap {
        position: relative;
        width: min(320px, calc(100vw - 166px));
        min-width: 238px;
      }

      #toolbar .fx2-trigger {
        width: 100%;
        min-height: 46px;
        display: grid;
        grid-template-columns: 32px minmax(0,1fr) 24px;
        align-items: center;
        gap: 10px;
        padding: 6px 9px;
        border: 1px solid rgba(255,255,255,.15) !important;
        border-radius: 11px !important;
        background: rgba(255,255,255,.085) !important;
        color: #fff !important;
        text-align: left;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
      }

      #toolbar .fx2-trigger:hover {
        background: rgba(255,255,255,.12) !important;
        transform: none !important;
      }

      #toolbar .fx2-trigger:focus-visible {
        outline: none !important;
        border-color: rgba(199,241,91,.76) !important;
        box-shadow: 0 0 0 2px rgba(199,241,91,.12) !important;
      }

      #toolbar .fx2-trigger-visual,
      #toolbar .fx2-card-visual {
        position: relative;
        display: block;
        overflow: hidden;
        flex: none;
        border-radius: 9px;
        background: #17171b;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
      }

      #toolbar .fx2-trigger-visual { width: 32px; height: 32px; }
      #toolbar .fx2-card-visual { width: 42px; height: 42px; }

      #toolbar .fx2-trigger-copy {
        min-width: 0;
        display: grid;
        gap: 2px;
      }

      #toolbar .fx2-trigger-label {
        color: #c7f15b;
        font-size: 9px;
        line-height: 1;
        font-weight: 900;
        letter-spacing: .1em;
      }

      #toolbar .fx2-trigger-current {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: #fff;
        font-size: 13px;
        line-height: 1.15;
        font-weight: 800;
      }

      #toolbar .fx2-chevron {
        width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        border-radius: 7px;
        color: rgba(255,255,255,.6);
        background: rgba(255,255,255,.04);
        transition: transform .16s ease, color .16s ease, background .16s ease;
      }

      #toolbar .fx2-chevron svg {
        width: 15px;
        height: 15px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      #toolbar .fx2-wrap.is-open .fx2-chevron {
        transform: rotate(180deg);
        color: #c7f15b;
        background: rgba(199,241,91,.09);
      }

      #toolbar .fx2-panel {
        position: absolute;
        z-index: 80;
        right: 0;
        bottom: calc(100% + 9px);
        width: min(438px, calc(100vw - 28px));
        padding: 9px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,.13);
        border-radius: 16px;
        background:
          radial-gradient(circle at 92% 0%, rgba(199,241,91,.055), transparent 34%),
          rgba(18,18,22,.91);
        box-shadow: 0 26px 72px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.035);
        backdrop-filter: blur(24px) saturate(1.16);
        -webkit-backdrop-filter: blur(24px) saturate(1.16);
        opacity: 0;
        transform: translateY(8px) scale(.982);
        transform-origin: 84% 100%;
        pointer-events: none;
        transition: opacity .15s ease, transform .17s cubic-bezier(.2,.8,.2,1);
      }

      #toolbar .fx2-panel[hidden] { display: none !important; }
      #toolbar .fx2-panel.is-visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      #toolbar .fx2-panel-head {
        min-height: 36px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 1px 5px 8px;
      }

      #toolbar .fx2-panel-title {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }

      #toolbar .fx2-panel-title strong {
        color: #fff;
        font-size: 12px;
        font-weight: 850;
        letter-spacing: -.01em;
      }

      #toolbar .fx2-panel-title span,
      #toolbar .fx2-panel-count {
        color: rgba(255,255,255,.38);
        font-size: 9px;
        font-weight: 700;
      }

      #toolbar .fx2-panel-count {
        color: rgba(199,241,91,.7);
        font-weight: 850;
      }

      #toolbar .fx2-grid {
        max-height: 250px;
        overflow-y: auto;
        overscroll-behavior: contain;
        display: grid;
        grid-template-columns: repeat(2, minmax(0,1fr));
        gap: 6px;
        padding: 1px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,.18) transparent;
      }

      #toolbar .fx2-card {
        position: relative;
        min-width: 0;
        min-height: 58px;
        display: grid;
        grid-template-columns: 42px minmax(0,1fr) 16px;
        align-items: center;
        gap: 8px;
        padding: 7px;
        border: 1px solid rgba(255,255,255,.055) !important;
        border-radius: 11px !important;
        background: rgba(255,255,255,.028) !important;
        color: rgba(255,255,255,.88) !important;
        text-align: left;
        box-shadow: none !important;
        transition: background .13s ease, border-color .13s ease, transform .13s ease;
      }

      #toolbar .fx2-card:hover,
      #toolbar .fx2-card.is-active {
        transform: translateY(-1px) !important;
        background: rgba(255,255,255,.065) !important;
        border-color: rgba(255,255,255,.12) !important;
      }

      #toolbar .fx2-card.is-selected {
        background: linear-gradient(90deg, rgba(199,241,91,.115), rgba(199,241,91,.025)) !important;
        border-color: rgba(199,241,91,.34) !important;
      }

      #toolbar .fx2-card:focus-visible {
        outline: none !important;
        border-color: rgba(199,241,91,.7) !important;
        box-shadow: 0 0 0 2px rgba(199,241,91,.1) !important;
      }

      #toolbar .fx2-card-copy {
        min-width: 0;
        display: grid;
        gap: 5px;
      }

      #toolbar .fx2-card-name {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: #fff;
        font-size: 12px;
        line-height: 1.1;
        font-weight: 760;
      }

      #toolbar .fx2-card-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 9px;
      }

      #toolbar .fx2-shortcut,
      #toolbar .fx2-live {
        font-size: 8px;
        line-height: 1;
        font-weight: 850;
        letter-spacing: .04em;
      }

      #toolbar .fx2-shortcut { color: rgba(255,255,255,.32); }
      #toolbar .fx2-live { color: rgba(199,241,91,.5); }
      #toolbar .fx2-check {
        color: #c7f15b;
        font-size: 12px;
        font-weight: 950;
        opacity: 0;
      }
      #toolbar .fx2-card.is-selected .fx2-check { opacity: 1; }

      /* visual signatures */
      #toolbar .fx2-holo { background: linear-gradient(135deg,#17171c,#5565ff 46%,#ff49a6 72%,#c7f15b); }
      #toolbar .fx2-holo::after { content:""; position:absolute; inset:43% -20%; height:2px; background:#fff; transform:rotate(-18deg); opacity:.82; }
      #toolbar .fx2-funhouse { background: radial-gradient(circle at 50% 50%,#f5f7ff 0 8%,#a9dbff 9% 17%,#17171d 19% 31%,#ff4a9d 33% 41%,#111116 43%); }
      #toolbar .fx2-prism { background: conic-gradient(from 210deg,#17171c,#6d61ff,#ff47a1,#c7f15b,#17171c); }
      #toolbar .fx2-negative { background: linear-gradient(135deg,#f4f4eb 0 50%,#0b0b0d 50%); }
      #toolbar .fx2-colornegative { background: linear-gradient(135deg,#ff4c7f,#532cff 48%,#c7f15b); }
      #toolbar .fx2-dot { background-color:#111116; background-image:radial-gradient(#e9f3ce 1px,transparent 1.25px); background-size:7px 7px; }
      #toolbar .fx2-antidot { background-color:#d5f95f; background-image:radial-gradient(#121216 1.15px,transparent 1.35px); background-size:7px 7px; }
      #toolbar .fx2-vangogh { background: linear-gradient(135deg,#25174d,#d428c4 52%,#f0b73e); }
      #toolbar .fx2-vangogh::after { content:""; position:absolute; width:60px; height:11px; left:-8px; top:14px; background:rgba(255,255,255,.48); transform:rotate(-24deg); filter:blur(3px); }
      #toolbar .fx2-glitch { background: linear-gradient(180deg,#111116 0 19%,#ff2f70 20% 36%,#111116 37% 53%,#31dff1 54% 69%,#111116 70%); }
      #toolbar .fx2-neon { background: radial-gradient(circle,#fff 0 7%,#c7f15b 9% 14%,#071009 23%); box-shadow:inset 0 0 18px rgba(199,241,91,.48); }
      #toolbar .fx2-raster { background: linear-gradient(180deg,#131318 0 20%,#ff4c8e 20% 34%,#131318 35% 53%,#6270ff 53% 67%,#131318 68%); }
      #toolbar .fx2-thermal { background: linear-gradient(135deg,#2535ff,#762fff,#ff315b,#ffb01d,#fff2a0); }
      #toolbar .fx2-wave { background: repeating-radial-gradient(circle at 50% 50%,#c7f15b 0 1px,#111116 2px 5px); }
      #toolbar .fx2-retropink { background: linear-gradient(180deg,#17171d,#5c2375,#ee3eaf); }
      #toolbar .fx2-spectrum { background: linear-gradient(90deg,#17171d 0 8%,#695bff 8% 20%,#17171d 20% 28%,#ff3e88 28% 43%,#17171d 43% 52%,#c7f15b 52% 72%,#17171d 72%); }

      @media (max-width: 560px) {
        #toolbar .fx2-wrap { min-width: 0; width: auto; flex: 1 1 auto; }
        #toolbar .fx2-trigger { min-height: 44px; grid-template-columns: 28px minmax(0,1fr) 22px; gap: 8px; }
        #toolbar .fx2-trigger-visual { width: 28px; height: 28px; border-radius: 8px; }
        #toolbar .fx2-panel { width: min(340px, calc(100vw - 20px)); max-height: 300px; }
        #toolbar .fx2-grid { grid-template-columns: 1fr; max-height: 248px; }
        #toolbar .fx2-card { min-height: 54px; grid-template-columns: 38px minmax(0,1fr) 16px; }
        #toolbar .fx2-card-visual { width: 38px; height: 38px; }
      }

      @media (prefers-reduced-motion: reduce) {
        #toolbar .fx2-panel,
        #toolbar .fx2-chevron,
        #toolbar .fx2-card { transition: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function labelFor(button) {
    const clone = button.cloneNode(true);
    clone.querySelectorAll('.key').forEach((node) => node.remove());
    return (button.title || clone.textContent || button.dataset.id || 'Effect')
      .replace(/\s*\([0-9]\)\s*$/, '')
      .trim();
  }

  function shortcutFor(button, index) {
    const explicit = button.querySelector('.key')?.textContent?.trim();
    if (explicit) return explicit.replace(/[()]/g, '');
    if (index < 9) return String(index + 1);
    if (index === 9) return '0';
    return '';
  }

  function selectedIndex() {
    const index = effectButtons.findIndex((button) =>
      button.classList.contains('active') || button.getAttribute('aria-pressed') === 'true'
    );
    return index >= 0 ? index : 0;
  }

  function visualClass(button) {
    return VISUAL_CLASS[button.dataset.id] || 'fx2-holo';
  }

  function setActive(index, scroll = true) {
    if (!cards.length) return;
    activeIndex = ((index % cards.length) + cards.length) % cards.length;
    cards.forEach((card, i) => {
      card.classList.toggle('is-active', i === activeIndex);
      card.tabIndex = i === activeIndex ? 0 : -1;
    });
    if (scroll) cards[activeIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function sync() {
    if (!built) return;
    const selected = selectedIndex();
    currentName.textContent = labelFor(effectButtons[selected]);
    const triggerVisual = trigger.querySelector('.fx2-trigger-visual');
    triggerVisual.className = `fx2-trigger-visual ${visualClass(effectButtons[selected])}`;

    cards.forEach((card, index) => {
      const isSelected = index === selected;
      card.classList.toggle('is-selected', isSelected);
      card.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      const name = card.querySelector('.fx2-card-name');
      if (name) name.textContent = labelFor(effectButtons[index]);
    });

    if (!open) setActive(selected, false);
  }

  function openPicker() {
    if (open) return;
    open = true;
    panel.hidden = false;
    picker.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    setActive(selectedIndex(), false);
    requestAnimationFrame(() => panel.classList.add('is-visible'));
  }

  function closePicker(restoreFocus = false) {
    if (!open) return;
    open = false;
    panel.classList.remove('is-visible');
    picker.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    setTimeout(() => {
      if (!open) panel.hidden = true;
    }, 170);
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function choose(index) {
    effectButtons[index]?.click();
    sync();
    closePicker(true);
  }

  function build() {
    if (built) return;
    effectButtons = Array.from(toolbar.querySelectorAll('button[data-id]'));
    if (!effectButtons.length) return;

    ensureStyles();
    effectButtons.forEach((button) => {
      button.classList.add('toolbar-effect-source');
      button.tabIndex = -1;
    });

    picker = document.createElement('div');
    picker.id = PICKER_ID;
    picker.className = 'fx2-wrap';

    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'fx2-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'fx2-panel');
    trigger.innerHTML = `
      <span class="fx2-trigger-visual ${visualClass(effectButtons[0])}" aria-hidden="true"></span>
      <span class="fx2-trigger-copy">
        <span class="fx2-trigger-label">FX</span>
        <span class="fx2-trigger-current"></span>
      </span>
      <span class="fx2-chevron" aria-hidden="true">
        <svg viewBox="0 0 20 20"><path d="m5.5 7.75 4.5 4.5 4.5-4.5"/></svg>
      </span>
    `;
    currentName = trigger.querySelector('.fx2-trigger-current');

    panel = document.createElement('div');
    panel.id = 'fx2-panel';
    panel.className = 'fx2-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', 'Live visual effects');

    const head = document.createElement('div');
    head.className = 'fx2-panel-head';
    head.innerHTML = `
      <div class="fx2-panel-title"><strong>FX</strong><span>Live effects</span></div>
      <span class="fx2-panel-count">${effectButtons.length}</span>
    `;

    const grid = document.createElement('div');
    grid.className = 'fx2-grid';

    cards = effectButtons.map((button, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'fx2-card';
      card.dataset.index = String(index);
      card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', 'false');
      card.tabIndex = -1;

      const shortcut = shortcutFor(button, index);
      card.innerHTML = `
        <span class="fx2-card-visual ${visualClass(button)}" aria-hidden="true"></span>
        <span class="fx2-card-copy">
          <span class="fx2-card-name">${labelFor(button)}</span>
          <span class="fx2-card-meta">
            ${shortcut ? `<span class="fx2-shortcut">${shortcut}</span>` : ''}
            <span class="fx2-live">LIVE</span>
          </span>
        </span>
        <span class="fx2-check" aria-hidden="true">✓</span>
      `;
      grid.appendChild(card);
      return card;
    });

    panel.append(head, grid);
    picker.append(trigger, panel);

    const oldSelect = toolbar.querySelector('.effect-select-wrap');
    oldSelect?.remove();
    const record = toolbar.querySelector('.record-button');
    if (record) record.insertAdjacentElement('afterend', picker);
    else toolbar.appendChild(picker);

    trigger.addEventListener('click', () => open ? closePicker() : openPicker());
    trigger.addEventListener('keydown', (event) => {
      if (['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openPicker();
        cards[activeIndex]?.focus({ preventScroll: true });
      }
      if (event.key === 'Escape') closePicker();
    });

    grid.addEventListener('mousemove', (event) => {
      const card = event.target.closest('.fx2-card');
      if (!card) return;
      setActive(Number(card.dataset.index), false);
    });

    grid.addEventListener('click', (event) => {
      const card = event.target.closest('.fx2-card');
      if (!card) return;
      choose(Number(card.dataset.index));
    });

    grid.addEventListener('keydown', (event) => {
      const cols = matchMedia('(max-width: 560px)').matches ? 1 : 2;
      let next = activeIndex;
      if (event.key === 'ArrowRight') next += 1;
      else if (event.key === 'ArrowLeft') next -= 1;
      else if (event.key === 'ArrowDown') next += cols;
      else if (event.key === 'ArrowUp') next -= cols;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = cards.length - 1;
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        choose(activeIndex);
        return;
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closePicker(true);
        return;
      } else return;

      event.preventDefault();
      setActive(next);
      cards[activeIndex]?.focus({ preventScroll: true });
    });

    document.addEventListener('pointerdown', (event) => {
      if (open && !picker.contains(event.target)) closePicker();
    }, true);

    document.addEventListener('keydown', (event) => {
      if (open && event.key === 'Escape') {
        event.preventDefault();
        closePicker(true);
      }
    });

    built = true;
    sync();
  }

  const observer = new MutationObserver(() => {
    if (!built) {
      build();
      return;
    }
    sync();
  });

  observer.observe(toolbar, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'aria-pressed', 'title'],
  });

  build();
})();
