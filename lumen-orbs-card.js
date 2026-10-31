/*
 * lumen-orbs-card  v2.2.0
 * Ogni interruttore è una sfera di vetro 3D che levita. Spenta: vetro tinto con il colore
 * "spento" che scegli. Accesa: si riempie di luce con il colore "acceso" (o il vero colore
 * delle luci RGB) con una transizione fluida, raggi rotanti e bagliore sul pavimento.
 * Tocco = accendi/spegni · Tocco lungo = dettagli.
 * v2.2: dimensione globale, riga di stato opzionale, colori qualità dell'aria, lampeggio "ghost"
 * per entità non disponibili e 3 stili animati: Sfera di vetro, Reattore a plasma, Liquido.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const TAU = Math.PI * 2;
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const mix = (c, t, k) => c.map((v, i) => Math.round(v + (t[i] - v) * k));
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const parseColor = (v, def) => {
  if (Array.isArray(v) && v.length >= 3) return v.slice(0, 3).map((n) => clamp(Math.round(+n) || 0, 0, 255));
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d+\s*,\s*\d+\s*,\s*\d+$/.test(s)) return s.split(',').map((x) => clamp(+x, 0, 255));
    let h = s.startsWith('#') ? s.slice(1) : s;
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((x) => x + x).join('');
    if (/^[0-9a-fA-F]{6}$/.test(h)) {
      const n = Number.parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
  }
  return def;
};

const normEnt = (e) => (typeof e === 'string' ? { entity: e } : e);
const idOf = (e) => (typeof e === 'string' ? e : e.entity);

function normGroups(c) {
  const groups = [];
  const loose = (c.entities || []).map(normEnt).filter((e) => e && e.entity);
  if (loose.length) groups.push({ id: '_loose', name: null, icon: null, entities: loose, room: null, isSingleEntity: false });
  
  (c.rooms || []).forEach((r, i) => {
    if (r.entity) {
      const entObj = normEnt(r);
      groups.push({ id: `e${i}`, name: r.name || null, icon: r.icon || null, entities: [entObj], room: null, isSingleEntity: true });
    } else {
      const ents = (r.entities || []).map(normEnt).filter((e) => e && e.entity);
      if (ents.length) {
        groups.push({ id: `r${i}`, name: r.name || `Stanza ${i + 1}`, icon: r.icon || null, entities: ents, room: r, isSingleEntity: false });
      }
    }
  });
  return groups;
}

const LAYOUTS = [
  { value: 'select', label: 'Selezionabile (una stanza alla volta)' },
  { value: 'grid', label: 'Affiancate (tutte in griglia)' },
];
const roomGridCols = (c) => (c.room_columns ? `repeat(${Number(c.room_columns)}, minmax(0, 1fr))` : 'repeat(auto-fit, minmax(min(100%, 290px), 1fr))');

const CHIP_CSS = `
  .rchips { display: flex; flex-wrap: wrap; gap: 8px; padding: 2px; margin: 0 -2px 10px; }
  .rchips::-webkit-scrollbar { display: none; }
  .rchips:empty, .rdev:empty { display: none; }
  .rdev { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px; margin: 0 -2px 8px; }
  .rdev::-webkit-scrollbar { display: none; }
  .rchip { flex: none; display: inline-flex; align-items: center; gap: 7px; border: 0; font: inherit; font-size: .85rem; font-weight: 600; cursor: pointer; --mdc-icon-size: 18px;
    padding: 8px 14px; border-radius: 999px; color: var(--primary-text-color); background: color-mix(in srgb, var(--primary-text-color) 9%, transparent); transition: background .25s, box-shadow .25s; }
  .rdev .rchip { font-size: .8rem; padding: 6px 12px; }
  .rchip.sel { background: color-mix(in srgb, var(--acc, #00b0ff) 24%, transparent); box-shadow: inset 0 0 0 1.5px var(--acc, #00b0ff); }
  .rchip .bd { font-size: .72rem; font-weight: 700; min-width: 18px; text-align: center; padding: 1px 6px; border-radius: 999px; background: color-mix(in srgb, var(--primary-text-color) 14%, transparent); }
  .rchip .lv { width: 8px; height: 8px; border-radius: 50%; background: var(--acc, #00b0ff); box-shadow: 0 0 8px var(--acc, #00b0ff); animation: rblink 1.4s ease-in-out infinite; }
  @keyframes rblink { 50% { opacity: .3; } }
  .rchip:focus-visible { outline: 2px solid var(--acc, #00b0ff); outline-offset: 2px; }
  .rhd { display: flex; align-items: center; gap: 8px; padding: 0 4px 8px; font-weight: 700; font-size: .98rem; color: var(--primary-text-color); --mdc-icon-size: 20px; }
  .rhd .rn { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rhd .rc { font-size: .78rem; font-weight: 600; color: var(--secondary-text-color); }
  .rhd .rb { border: 0; font: inherit; font-size: .78rem; font-weight: 600; cursor: pointer; color: var(--primary-text-color); padding: 5px 11px; border-radius: 999px; background: color-mix(in srgb, var(--primary-text-color) 10%, transparent); }
  .room.panel { background: color-mix(in srgb, var(--primary-text-color) 5%, transparent); border-radius: 20px; padding: 12px 10px 10px; }
  @media (prefers-reduced-motion: reduce) { .rchip .lv { animation: none; } }
`;

function chipsInto(el, items, selId, onPick) {
  el.innerHTML = items.length > 1
    ? items.map((i) => `<button class="rchip ${i.id === selId ? 'sel' : ''}" data-id="${esc(i.id)}">${i.icon ? `<ha-icon icon="${esc(i.icon)}"></ha-icon>` : ''}${i.live ? '<span class="lv"></span>' : ''}${esc(i.label)}${i.badge != null && i.badge !== '' ? `<span class="bd">${esc(i.badge)}</span>` : ''}</button>`).join('')
    : '';
  el.querySelectorAll('.rchip').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
}

const EDITOR_CSS = `
  :host { display: block; }
  .sh { font-weight: 700; margin: 18px 0 4px; font-size: 1rem; color: var(--primary-text-color); }
  .hint { font-size: .82rem; color: var(--secondary-text-color); margin: 0 0 8px; }
  .room { border: 1px solid var(--divider-color, rgba(127,127,127,.35)); border-radius: 14px; padding: 8px 12px 6px; margin: 10px 0; background: var(--secondary-background-color, rgba(127,127,127,.08)); }
  .rh { display: flex; align-items: center; gap: 8px; padding: 2px 0 6px; }
  .idx { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: .8rem; font-weight: 700; color: #fff; background: var(--primary-color, #03a9f4); }
  .rn { font-weight: 600; color: var(--primary-text-color); }
  .sp { flex: 1; }
  .rh button { border: 0; font: inherit; cursor: pointer; color: var(--primary-text-color); background: color-mix(in srgb, var(--primary-text-color) 10%, transparent); width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; --mdc-icon-size: 20px; }
  .rh button[disabled] { opacity: .3; cursor: default; }
  .rh button[data-a=del] { color: var(--error-color, #db4437); }
  .actions-row { display: flex; gap: 8px; margin-top: 8px; }
  .add { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; font-weight: 600; font-size: .85rem; --mdc-icon-size: 18px; border: 0; cursor: pointer; color: var(--primary-text-color); background: color-mix(in srgb, var(--primary-text-color) 10%, transparent); }
`;

function makeRoomsEditor(o) {
  const L = {
    layout: 'Visualizzazione',
    room_columns: 'Elementi affiancati per riga (vuoto = automatico)',
    entities: o.looseLabel || 'Dispositivi senza stanza (opzionale)',
    name: 'Nome (opzionale se entità singola)',
    icon: 'Icona',
    entity: 'Entità Dispositivo',
    ...o.labels,
  };

  const roomSchema = [
    { name: 'name', selector: { text: {} } },
    { name: 'icon', selector: { icon: {} } },
    { name: 'entities', selector: { entity: { multiple: true, domain: o.domains } } },
  ];

  const singleSchema = [
    { name: 'entity', selector: { entity: { domain: o.domains } } },
    { name: 'name', selector: { text: {} } },
    { name: 'icon', selector: { icon: {} } },
  ];

  const genSchema = [...o.schema];
  const genSchemaNames = new Set(genSchema.flatMap((f) => (f.type === 'grid' ? f.schema.map((x) => x.name) : [f.name])));
  const keysToCheck = ['name', 'icon', 'entity', 'entities'];
  const empty = (v) => v === '' || v == null || (typeof v === 'number' && !Number.isFinite(v));

  return class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._gen = {};
      this._loose = [];
      this._rooms = [];
      this._last = '';
    }

    setConfig(config) {
      const j = JSON.stringify(config || {});
      if (j === this._last && this._drawn) return;
      this._last = j;
      const { rooms, entities, ...rest } = JSON.parse(j);
      this._gen = rest;
      this._loose = entities || [];
      this._rooms = (rooms || []).map((r) => ({ ...r, entities: r.entities || [] }));
      this._draw();
    }

    set hass(h) {
      this._hass = h;
      this.shadowRoot.querySelectorAll('ha-form').forEach((f) => { f.hass = h; });
    }

    _draw() {
      const r = this.shadowRoot;
      r.innerHTML = `<style>${EDITOR_CSS}</style><div class="gen"></div>
        <div class="sh">Elementi e Stanze</div><p class="hint">Crea stanze con più dispositivi oppure aggiungi singole entità direttamente.</p>
        <div class="rooms"></div>
        <div class="actions-row">
          <button class="add add-room" type="button"><ha-icon icon="mdi:folder-plus-outline"></ha-icon>Aggiungi stanza</button>
          <button class="add add-single" type="button"><ha-icon icon="mdi:plus-box-outline"></ha-icon>Aggiungi singola entità</button>
        </div>`;

      const gen = document.createElement('ha-form');
      gen.computeLabel = (s) => L[s.name] || s.name;
      gen.hass = this._hass;
      gen.schema = genSchema;
      gen.data = { ...(o.defaults || {}), ...this._gen };
      gen.addEventListener('value-changed', (e) => this._genChanged(e));
      r.querySelector('.gen').appendChild(gen);

      r.querySelector('.add-room').addEventListener('click', () => {
        this._rooms.push({ name: `Stanza ${this._rooms.length + 1}`, entities: [] });
        this._emit();
        this._drawRooms();
      });

      r.querySelector('.add-single').addEventListener('click', () => {
        this._rooms.push({ entity: '', name: '' });
        this._emit();
        this._drawRooms();
      });

      this._drawRooms();
      this._drawn = true;
    }

    _drawRooms() {
      const box = this.shadowRoot.querySelector('.rooms');
      box.innerHTML = '';
      const n = this._rooms.length;
      this._rooms.forEach((room, i) => {
        const isSingle = !!room.entity || room.entity === '';
        const d = document.createElement('div');
        d.className = 'room';
        const titleText = isSingle ? (room.entity || 'Nuova entità') : (room.name || `Stanza ${i + 1}`);

        d.innerHTML = `<div class="rh"><span class="idx">${i + 1}</span><span class="rn"></span><span class="sp"></span>
          <button type="button" data-a="up" title="Sposta prima" ${i === 0 ? 'disabled' : ''}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button type="button" data-a="down" title="Sposta dopo" ${i === n - 1 ? 'disabled' : ''}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
          <button type="button" data-a="del" title="Elimina"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div><div class="rf"></div>`;

        d.querySelector('.rn').textContent = titleText;
        const f = document.createElement('ha-form');
        f.computeLabel = (s) => L[s.name] || s.name;
        f.hass = this._hass;
        f.schema = isSingle ? singleSchema : roomSchema;

        f.data = isSingle 
          ? { entity: room.entity || '', name: room.name || '', icon: room.icon || '' }
          : { ...room, entities: (room.entities || []).map(idOf) };

        f.addEventListener('value-changed', (e) => {
          e.stopPropagation();
          const v = e.detail.value || {};
          keysToCheck.forEach((k) => {
            if (empty(v[k])) delete room[k];
            else room[k] = v[k];
          });
          if (!isSingle) {
            const old = new Map((room.entities || []).map((x) => [idOf(x), x]));
            room.entities = (v.entities || []).map((id) => old.get(id) || id);
          }
          d.querySelector('.rn').textContent = isSingle ? (room.entity || 'Entità') : (room.name || `Stanza ${i + 1}`);
          this._emit();
        });

        d.querySelector('.rf').appendChild(f);
        d.querySelectorAll('button[data-a]').forEach((b) => b.addEventListener('click', () => this._act(i, b.dataset.a)));
        box.appendChild(d);
      });
    }

    _act(i, a) {
      const rs = this._rooms;
      if (a === 'up' && i > 0) [rs[i - 1], rs[i]] = [rs[i], rs[i - 1]];
      else if (a === 'down' && i < rs.length - 1) [rs[i + 1], rs[i]] = [rs[i], rs[i + 1]];
      else if (a === 'del') {
        if (typeof confirm === 'function' && !confirm('Eliminare questo elemento?')) return;
        rs.splice(i, 1);
      } else return;
      this._emit();
      this._drawRooms();
    }

    _genChanged(e) {
      e.stopPropagation();
      const v = { ...(e.detail.value || {}) };
      Object.keys(v).forEach((k) => { if (empty(v[k])) delete v[k]; });
      const keep = {};
      Object.keys(this._gen).forEach((k) => { if (!genSchemaNames.has(k)) keep[k] = this._gen[k]; });
      this._gen = { ...keep, ...v };
      this._emit();
    }

    _emit() {
      const cfg = { ...this._gen };
      if (this._loose.length) cfg.entities = this._loose;
      if (this._rooms.length) cfg.rooms = this._rooms.map((r) => ({ ...r }));
      this._last = JSON.stringify(cfg);
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: cfg }, bubbles: true, composed: true }));
    }
  };
}

const DOM_COL = {
  light: [255, 190, 70], switch: [0, 176, 255], fan: [60, 220, 200], automation: [170, 120, 255],
  input_boolean: [255, 100, 170], scene: [255, 140, 60], script: [110, 230, 120], button: [240, 240, 255],
  sensor: [100, 200, 255], binary_sensor: [120, 220, 150], lock: [250, 150, 100], select: [200, 150, 250],
};
const OFF_DEF = [74, 90, 124];
const GHOST = [248, 248, 255];
const K = (n) => `calc(${n}px * var(--k))`;
const UNKNOWN_OK = new Set(['scene', 'button', 'input_button', 'script']);
const INFO_ONLY = new Set(['sensor', 'binary_sensor', 'select']);
const AQ_ALIAS = {
  excellent: 'excellent', very_good: 'excellent', good: 'good', fair: 'moderate', moderate: 'moderate', medium: 'moderate',
  poor: 'poor', bad: 'poor', unhealthy_for_sensitive_groups: 'poor', severe: 'severe', very_poor: 'severe', unhealthy: 'severe',
  danger: 'danger', dangerous: 'danger', hazardous: 'danger', very_unhealthy: 'danger',
};
const AQ_COL = { excellent: [0, 255, 0], good: [127, 255, 0], moderate: [255, 215, 0], poor: [255, 165, 0], severe: [255, 40, 40], danger: [176, 64, 255] };
const AQ_LEVEL = { excellent: 1, good: 0.82, moderate: 0.64, poor: 0.46, severe: 0.3, danger: 0.18 };
const AQ_LABEL = { excellent: 'Eccellente', good: 'Buona', moderate: 'Moderata', poor: 'Scarsa', severe: 'Pessima', danger: 'Pericolosa' };
const ORB_STYLES = [
  { value: 'orb', label: 'Sfera di vetro 3D (classica)' },
  { value: 'reactor', label: 'Reattore a plasma (anelli, radar e particelle)' },
  { value: 'liquid', label: 'Liquido (onde, bollicine, livello = luminosità)' },
];
const ACTION_DOMAINS = { scene: ['scene', 'turn_on'], script: ['script', 'turn_on'], button: ['button', 'press'] };
const C = 'var(--lr),var(--lg),var(--lb)';
let PROPS = false;
function regProps() {
  if (PROPS) return;
  PROPS = true;
  try {
    if (typeof CSS !== 'undefined' && CSS.registerProperty) {
      for (const n of ['--lr', '--lg', '--lb']) CSS.registerProperty({ name: n, syntax: '<number>', inherits: true, initialValue: '0' });
    }
  } catch (e) {}
}

class LumenOrbsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  static getConfigElement() { return document.createElement('lumen-orbs-card-editor'); }
  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {}).filter((e) => /^(light|switch)\./.test(e)).slice(0, 6);
    return { title: 'Luci', layout: 'grid', rooms: [{ name: 'Stanza 1', entities: ids }] };
  }

  setConfig(config) {
    if (!config) throw new Error('Configurazione mancante');
    const groups = normGroups(config);
    // Una configurazione temporaneamente vuota non deve far fallire la card.
    this._config = { show_all_off: true, layout: 'grid', orb_style: 'orb', orb_scale: 1, show_state: false, ...config };
    this._groups = groups;
    this._sel = null;
    this._csig = null;
    this._build();
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) return;
    try { this._update(); } catch (e) { console.error('lumen-orbs-card: errore di aggiornamento', e); }
  }

  getCardSize() {
    return 2 + Math.ceil(this._groups.reduce((n, g) => n + g.entities.length, 0) / 3) * 2;
  }
  getGridOptions() { return { columns: 12, min_columns: 4, rows: 'auto' }; }

  _build() {
    regProps();
    const c = this._config;
    const gs = this._groups;
    const cols = c.columns ? `repeat(${Number(c.columns)}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${K(104)}, 1fr))`;
    let n = 0;
    const rooms = gs
      .map(
        (g) => `<section class="room" data-g="${esc(g.id)}">
          <div class="rhd" ${!g.name && !g.icon ? 'hidden' : ''}>${g.icon ? `<ha-icon icon="${esc(g.icon)}"></ha-icon>` : ''}<span class="rn">${esc(g.name || '')}</span><span class="rc"></span><button class="rb" type="button">Spegni</button></div>
          <div class="grid">${g.entities
            .map(
              (it) => `<button class="orb" data-n="${n}" style="--d:${-(n++ * 0.9).toFixed(2)}s" aria-label="${esc(it.name || it.entity)}">
                <span class="scene"><span class="floor"></span><span class="stage"><span class="halo"></span><span class="rays"></span><span class="burst"></span>
                  <span class="reactor"><i class="rg r1"></i><i class="rg r2"></i><i class="rg r3"></i><i class="orbit o1"><b></b></i><i class="orbit o2"><b></b><b></b></i></span>
                  <span class="sphere"><span class="lit"></span><span class="liq"><i class="w w1"></i><i class="w w2"></i><i class="bub" style="--x:22%;--bd:0s"></i><i class="bub" style="--x:50%;--bd:1.1s;--sz:.7"></i><i class="bub" style="--x:72%;--bd:2.1s"></i></span><span class="shade"></span><span class="gloss"></span><span class="ico"><ha-state-icon></ha-state-icon></span></span></span></span>
                <span class="nm"></span><span class="sx"></span></button>`
            )
            .join('')}</div></section>`
      )
      .join('');

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        [hidden] { display: none !important; }
        ha-card { position: relative; overflow: hidden; border-radius: var(--ha-card-border-radius, 26px); --tx: 0; --ty: 0; --acc: #ffbe46; }
        .bg { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(90% 60% at 50% 105%, color-mix(in srgb, var(--primary-color, #00b0ff) 16%, transparent), transparent 70%); }
        .in { position: relative; padding: 18px 14px 12px; }
        .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 6px 8px; min-height: 36px; }
        .head.empty { display: none; }
        .title { font-size: 1.15rem; font-weight: 600; letter-spacing: -0.01em; color: var(--primary-text-color); }
        .sub { font-size: .85rem; color: var(--secondary-text-color); margin-top: 2px; }
        .alloff { border: 0; font: inherit; font-size: .85rem; font-weight: 600; cursor: pointer; color: var(--primary-text-color); padding: 8px 14px; border-radius: 999px; background: color-mix(in srgb, var(--primary-text-color) 10%, transparent); }
        .rooms { display: grid; gap: 12px; }
        .grid { display: grid; grid-template-columns: ${cols}; gap: 4px; perspective: 900px; }
        ${CHIP_CSS}
        .orb { --lr: 255; --lg: 190; --lb: 70; --o: 74,90,124; --od: 30,36,50; --ol: 160,172,196; --b: 1; --lvl: .1;
          transition: --lr .7s, --lg .7s, --lb .7s;
          border: 0; background: none; font: inherit; color: var(--primary-text-color); cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: ${K(8)} 2px ${K(10)};
          -webkit-tap-highlight-color: transparent; user-select: none; }
        .orb:focus-visible { outline: 2px solid rgb(${C}); outline-offset: 2px; border-radius: 20px; }
        .scene { position: relative; width: ${K(100)}; height: ${K(124)}; }
        .floor { position: absolute; left: 50%; bottom: ${K(4)}; width: ${K(74)}; height: ${K(15)}; margin-left: ${K(-37)}; border-radius: 50%; background: radial-gradient(ellipse, rgba(0,0,0,.55), transparent 70%);
          transition: background .6s; animation: fl 5s ease-in-out infinite; animation-delay: var(--d); }
        .on .floor { background: radial-gradient(ellipse, rgba(${C}, .8), transparent 70%); }
        @keyframes fl { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(.8); opacity: .65; } }
        .stage { position: absolute; left: 0; right: 0; top: ${K(4)}; height: ${K(100)}; display: grid; place-items: center; animation: float 5s ease-in-out infinite; animation-delay: var(--d); }
        @keyframes float { 0%,100% { transform: translateY(calc(2px * var(--k))); } 50% { transform: translateY(calc(-8px * var(--k))); } }
        .halo { position: absolute; width: ${K(150)}; height: ${K(150)}; border-radius: 50%; background: radial-gradient(circle, rgba(${C}, .6), transparent 62%); opacity: 0; transform: scale(.55); transition: opacity .7s, transform .7s; pointer-events: none; }
        .on .halo { opacity: calc(.45 + var(--b) * .55); transform: scale(1); animation: pulse 3.2s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.4); } }
        .rays { position: absolute; width: ${K(138)}; height: ${K(138)}; border-radius: 50%; opacity: 0; transition: opacity .8s; pointer-events: none;
          background: repeating-conic-gradient(from 0deg, rgba(${C}, 0) 0 9deg, rgba(${C}, .55) 10deg 11.5deg, rgba(${C}, 0) 13deg 22deg);
          -webkit-mask: radial-gradient(circle, transparent 36%, #000 50%, transparent 72%); mask: radial-gradient(circle, transparent 36%, #000 50%, transparent 72%); animation: spin 18s linear infinite; }
        .on .rays { opacity: .85; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .burst { position: absolute; width: ${K(80)}; height: ${K(80)}; border-radius: 50%; border: 2px solid rgba(${C}, .95); opacity: 0; pointer-events: none; }
        .pop .burst { animation: burst .6s ease-out; }
        .pop .sphere { animation: squash .45s ease-out; }
        @keyframes burst { from { transform: scale(1); opacity: 1; } to { transform: scale(2.4); opacity: 0; } }
        @keyframes squash { 0% { scale: 1; } 35% { scale: .88; } 70% { scale: 1.07; } 100% { scale: 1; } }
        .sphere { position: relative; width: ${K(80)}; height: ${K(80)}; border-radius: 50%; overflow: hidden; transform-style: preserve-3d;
          transform: rotateY(calc(var(--tx) * 18deg)) rotateX(calc(var(--ty) * -18deg)); transition: transform .25s ease-out;
          background: radial-gradient(circle at 50% 60%, rgba(var(--o), .42), rgba(var(--od), .9) 74%), rgba(var(--od), .75);
          box-shadow: inset 0 -10px 18px rgba(0,0,0,.5), inset 0 6px 12px rgba(255,255,255,.14), 0 10px 22px rgba(0,0,0,.4); }
        .lit { position: absolute; inset: 0; border-radius: 50%; opacity: 0; transition: opacity .6s;
          background: radial-gradient(circle at 50% 62%, rgba(255,255,255,.95), rgb(${C}) 26%, rgba(${C}, .8) 60%, rgba(${C}, .4) 100%); }
        .on .lit { opacity: calc(.55 + var(--b) * .45); }
        .shade { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle at 72% 80%, rgba(0,0,0,.5), transparent 58%); }
        .gloss { position: absolute; left: 14%; top: 7%; width: 48%; height: 32%; border-radius: 50%; background: linear-gradient(180deg, rgba(255,255,255,.8), rgba(255,255,255,0));
          transform: translate(calc(var(--tx) * -6px), calc(var(--ty) * -5px)); transition: transform .25s ease-out; }
        .ico { position: absolute; inset: 0; display: grid; place-items: center; --mdc-icon-size: ${K(30)}; color: rgb(var(--ol)); transition: color .5s; }
        .on .ico { color: #fff; filter: drop-shadow(0 0 6px rgba(${C}, .95)); }
        .nm { font-weight: 600; font-size: max(.66rem, calc(.92rem * var(--k))); text-align: center; line-height: 1.2; max-width: 100%; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--name-color, var(--primary-text-color)); }
        .sx { font-size: max(.58rem, calc(.76rem * var(--k))); color: var(--secondary-text-color); transition: color .5s; }
        .on .sx { color: rgb(${C}); filter: brightness(1.15); }

        /* entità non disponibile: tutto lampeggia in ghostwhite */
        @keyframes gblink { 0%,100% { opacity: 1; } 50% { opacity: .12; } }
        .unavail .scene, .unavail .nm { animation: gblink 1s ease-in-out infinite; }

        /* ---------- stile: sfera (default) - gli elementi degli altri stili restano nascosti ---------- */
        .reactor, .liq { display: none; }

        /* ---------- stile: REATTORE A PLASMA ---------- */
        [data-style=reactor] .rays, [data-style=reactor] .gloss, [data-style=reactor] .shade { display: none; }
        [data-style=reactor] .reactor { display: block; position: absolute; width: ${K(114)}; height: ${K(114)}; pointer-events: none; }
        .reactor > * { position: absolute; border-radius: 50%; display: block; }
        .reactor::before { content: ''; position: absolute; inset: -2%; border-radius: 50%; opacity: 0; transition: opacity .6s;
          background: conic-gradient(from 0deg, transparent 0 285deg, rgba(${C}, .12) 300deg, rgba(${C}, .55) 358deg, rgba(${C}, .95) 360deg);
          -webkit-mask: radial-gradient(circle, transparent 30%, #000 42%, #000 62%, transparent 72%); mask: radial-gradient(circle, transparent 30%, #000 42%, #000 62%, transparent 72%);
          animation: spin 2.8s linear infinite; }
        .on .reactor::before { opacity: .8; }
        .rg { inset: 0; }
        .r1 { background: repeating-conic-gradient(from 0deg, rgba(var(--ol), .5) 0 16deg, transparent 16deg 30deg);
          -webkit-mask: radial-gradient(circle, transparent 63%, #000 64% 71%, transparent 72%); mask: radial-gradient(circle, transparent 63%, #000 64% 71%, transparent 72%); animation: spin 42s linear infinite; }
        .on .r1 { background: repeating-conic-gradient(from 0deg, rgba(${C}, .95) 0 16deg, transparent 16deg 30deg); animation-duration: 9s; filter: drop-shadow(0 0 4px rgba(${C}, .8)); }
        .r2 { inset: 13%; background: repeating-conic-gradient(from 10deg, rgba(var(--ol), .38) 0 40deg, transparent 40deg 60deg);
          -webkit-mask: radial-gradient(circle, transparent 69%, #000 70% 78%, transparent 79%); mask: radial-gradient(circle, transparent 69%, #000 70% 78%, transparent 79%); animation: spin 30s linear infinite reverse; }
        .on .r2 { background: repeating-conic-gradient(from 10deg, rgba(${C}, .85) 0 40deg, transparent 40deg 60deg); animation-duration: 5.5s; }
        .r3 { inset: 25%; border: 1.5px solid rgba(var(--ol), .4); transition: border-color .5s, box-shadow .5s; }
        .on .r3 { border-color: rgba(${C}, .85); box-shadow: 0 0 12px rgba(${C}, .6), inset 0 0 12px rgba(${C}, .4); animation: rpulse 2.2s ease-in-out infinite; }
        @keyframes rpulse { 0%,100% { transform: scale(.96); opacity: .75; } 50% { transform: scale(1.06); opacity: 1; } }
        .orbit { inset: 0; opacity: 0; transition: opacity .6s; animation: spin 4.2s linear infinite; }
        .o2 { inset: 14%; animation-duration: 2.7s; animation-direction: reverse; }
        .on .orbit { opacity: 1; }
        .orbit b { position: absolute; left: 50%; top: ${K(-3)}; width: ${K(6)}; height: ${K(6)}; margin-left: ${K(-3)}; border-radius: 50%; background: #fff; box-shadow: 0 0 8px 2px rgba(${C}, .95); }
        .orbit b:nth-child(2) { top: auto; bottom: ${K(-3)}; }
        [data-style=reactor] .sphere { width: ${K(50)}; height: ${K(50)}; transform: none; transition: none;
          background: radial-gradient(circle at 50% 55%, rgba(var(--o), .55), rgba(var(--od), .96) 78%);
          box-shadow: 0 0 0 2px rgba(var(--ol), .45), inset 0 0 14px rgba(0,0,0,.6); }
        [data-style=reactor] .orb.on .sphere { box-shadow: 0 0 0 2px rgba(${C}, .95), 0 0 20px 3px rgba(${C}, .7), inset 0 0 14px rgba(255,255,255,.35); }
        [data-style=reactor] .on .lit { animation: corebeat 1.5s ease-in-out infinite; }
        @keyframes corebeat { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.55); } }
        [data-style=reactor] .ico { --mdc-icon-size: ${K(24)}; }
        [data-style=reactor] .pop .r1, [data-style=reactor] .pop .r2 { animation-duration: .7s; }

        /* ---------- stile: LIQUIDO ---------- */
        [data-style=liquid] .rays, [data-style=liquid] .lit { display: none; }
        [data-style=liquid] .liq { display: block; position: absolute; inset: 0; transform: translateY(calc((1 - var(--lvl)) * 130% - 14%)); transition: transform 1.2s cubic-bezier(.34,1.3,.5,1); }
        .w { position: absolute; left: -50%; top: 0; width: 200%; height: 200%; border-radius: 42%; display: block; background: rgba(var(--o), .6); transition: background .6s; animation: spin 8s linear infinite; }
        .w2 { left: -46%; border-radius: 45%; background: rgba(var(--o), .35); animation-duration: 12.5s; animation-direction: reverse; }
        .on .w { background: rgba(${C}, .66); }
        .on .w2 { background: rgba(${C}, .5); }
        .bub { position: absolute; bottom: 6%; left: var(--x); width: ${K(6)}; height: ${K(6)}; border-radius: 50%; display: block; opacity: 0; background: rgba(255,255,255,.6); box-shadow: inset 0 0 2px rgba(255,255,255,.9); scale: var(--sz, 1); }
        .on .bub { animation: rise 3.4s ease-in infinite; animation-delay: var(--bd); }
        @keyframes rise { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: .85; } 100% { transform: translateY(calc(-62px * var(--k))); opacity: 0; } }
        [data-style=liquid] .orb.on .sphere { box-shadow: inset 0 -10px 18px rgba(0,0,0,.4), inset 0 6px 12px rgba(255,255,255,.2), 0 10px 22px rgba(0,0,0,.4), 0 0 26px rgba(${C}, .5); }
        [data-style=liquid] .pop .liq { animation: slosh .9s ease-out; }
        @keyframes slosh { 0% { rotate: 0deg; } 20% { rotate: 16deg; } 45% { rotate: -11deg; } 70% { rotate: 6deg; } 100% { rotate: 0deg; } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      </style>
      <ha-card>
        <div class="bg"></div>
        <div class="in">
          <div class="head"><div><div class="title"></div><div class="sub"></div></div><button class="alloff" type="button" hidden>Spegni tutto</button></div>
          <div class="rchips"></div>
          <div class="rooms">${rooms}</div>
        </div>
      </ha-card>`;

    const r = this.shadowRoot;
    const card = r.querySelector('ha-card');
    this._card = card;
    card.dataset.style = ['orb', 'reactor', 'liquid'].includes(c.orb_style) ? c.orb_style : 'orb';
    card.style.setProperty('--k', String(clamp(Number(c.orb_scale) || 1, 0.4, 2)));
    const nameColor = parseColor(c.color_name, null);
    if (nameColor) {
      card.style.setProperty('--name-color', `rgb(${nameColor.join(',')})`);
    } else {
      card.style.removeProperty('--name-color');
    }
    this._head = r.querySelector('.head');
    this._title = r.querySelector('.title');
    this._sub = r.querySelector('.sub');
    this._all = r.querySelector('.alloff');
    this._chips = r.querySelector('.rchips');
    this._roomsEl = r.querySelector('.rooms');
    this._all.addEventListener('click', () => this._turnOff(this._orbs.map((o) => o.it.entity)));

    const tilt = (e) => {
      const b = card.getBoundingClientRect();
      card.style.setProperty('--tx', (((e.clientX - b.left) / b.width) * 2 - 1).toFixed(3));
      card.style.setProperty('--ty', (((e.clientY - b.top) / b.height) * 2 - 1).toFixed(3));
    };
    card.addEventListener('pointermove', tilt);
    card.addEventListener('pointerdown', tilt);
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--tx', 0);
      card.style.setProperty('--ty', 0);
    });

    this._rooms = [...r.querySelectorAll('.room')].map((el, i) => ({
      el, g: gs[i], hd: el.querySelector('.rhd'), cnt: el.querySelector('.rc'), btn: el.querySelector('.rb'),
    }));
    this._rooms.forEach((rm) => rm.btn.addEventListener('click', () => this._turnOff(rm.g.entities.map((e) => e.entity))));
    this._orbs = [];
    r.querySelectorAll('.orb').forEach((el) => {
      const it = gs.flatMap((g) => g.entities)[Number(el.dataset.n)];
      this._orbs.push({ el, it, icon: el.querySelector('ha-state-icon'), nm: el.querySelector('.nm'), sx: el.querySelector('.sx') });
      let timer = null;
      let held = false;
      el.addEventListener('pointerdown', () => {
        held = false;
        timer = setTimeout(() => {
          held = true;
          this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: it.entity }, bubbles: true, composed: true }));
        }, 500);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, () => clearTimeout(timer)));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('click', () => {
        if (held) { held = false; return; }
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
        setTimeout(() => el.classList.remove('pop'), 700);
        this._toggle(it.entity);
      });
    });
    this._built = true;
    this._applyLayout();
  }

  _applyLayout() {
    const c = this._config;
    const gs = this._groups;
    const select = c.layout === 'select' && gs.length > 1;
    if (select && !this._sel) this._sel = c.all_tab !== false ? '*' : gs[0].id;
    if (!select) this._sel = null;
    const all = !select || this._sel === '*';
    this._rooms.forEach((rm) => {
      rm.el.hidden = !(all || rm.g.id === this._sel);
      rm.hd.hidden = !((rm.g.name || rm.g.icon) && all);
      rm.el.classList.toggle('panel', all && (gs.length > 1 || rm.g.isSingleEntity));
    });
    this._roomsEl.style.gridTemplateColumns = all && gs.length > 1 ? roomGridCols(c) : '1fr';
    this._chips.hidden = !select;
  }

  _update() {
    const h = this._hass;
    const c = this._config;
    const gs = this._groups;
    const offDef = parseColor(c.color_off, OFF_DEF);
    const useLight = c.use_light_color ?? !c.color_on;
    const onGlobal = parseColor(c.color_on, null);
    const gOn = {};
    let on = 0;

    this._orbs.forEach((o) => {
      const it = o.it;
      const st = h.states[it.entity];
      const domain = it.entity.split('.')[0];
      const stateStr = st ? String(st.state) : '';
      const isOn = !!st && stateStr === 'on';
      const isLocked = domain === 'lock' && stateStr === 'locked';
      const noVal = !st || stateStr === 'unavailable' || (stateStr === 'unknown' && !UNKNOWN_OK.has(domain));
      if (isOn) on++;

      /* qualità dell'aria: sensori con stati excellent/good/moderate/poor/severe/danger */
      const aqKey = !noVal && domain === 'sensor' && it.air_quality !== false ? AQ_ALIAS[stateStr.toLowerCase()] : null;
      const lit = isOn || isLocked || !!aqKey || noVal;

      let col = null;
      if (noVal) col = GHOST;
      else if (aqKey) col = parseColor(it.air_colors?.[stateStr.toLowerCase()], null) || AQ_COL[aqKey];
      else {
        col = parseColor(it.color_on ?? it.color, null);
        if (!col && useLight && st?.attributes.rgb_color) col = st.attributes.rgb_color.slice(0, 3);
        if (!col) col = onGlobal || DOM_COL[domain] || [0, 176, 255];
      }
      const off = parseColor(it.color_off, offDef);
      const s = o.el.style;
      s.setProperty('--lr', String(col[0]));
      s.setProperty('--lg', String(col[1]));
      s.setProperty('--lb', String(col[2]));
      s.setProperty('--o', off.join(','));
      s.setProperty('--od', mix(off, BLACK, 0.62).join(','));
      s.setProperty('--ol', mix(off, WHITE, 0.45).join(','));

      let pct = null;
      if (domain === 'light' && isOn && st.attributes.brightness != null) pct = Math.round((st.attributes.brightness / 255) * 100);
      s.setProperty('--b', pct != null ? Math.max(0.35, pct / 100).toFixed(2) : '1');
      const lvl = noVal ? 1 : aqKey ? AQ_LEVEL[aqKey] : isOn ? (pct != null ? Math.max(0.2, pct / 100) : 1) : 0.1;
      s.setProperty('--lvl', lvl.toFixed(2));
      o.el.classList.toggle('on', lit);
      o.el.classList.toggle('unavail', noVal);
      o.el.setAttribute('aria-pressed', String(isOn || isLocked));
      o.nm.textContent = it.name || st?.attributes.friendly_name || it.entity;
      let txt = noVal ? 'Non disponibile' : aqKey ? AQ_LABEL[aqKey] : h.formatEntityState ? h.formatEntityState(st) : st.state;
      if (pct != null) txt = `${pct}%`;
      o.sx.textContent = txt;
      o.sx.hidden = c.show_state !== true;
      if (o.icon) {
        o.icon.hass = h;
        o.icon.stateObj = st;
        if (it.icon) o.icon.icon = it.icon;
      }
    });

    this._rooms.forEach((rm) => {
      const n = rm.g.entities.length;
      const k = rm.g.entities.filter((e) => h.states[e.entity]?.state === 'on').length;
      gOn[rm.g.id] = k;
      rm.cnt.textContent = `${k}/${n}`;
      rm.btn.hidden = k === 0;
    });

    this._card.style.setProperty('--acc', `rgb(${(onGlobal || DOM_COL.light).join(',')})`);
    this._title.textContent = c.title || '';
    this._sub.textContent = on === 0 ? 'Tutto spento' : on === 1 ? '1 acceso' : `${on} accesi su ${this._orbs.length}`;
    this._all.hidden = !(on > 0 && c.show_all_off !== false);
    this._head.classList.toggle('empty', !c.title && this._all.hidden && true);

    if (c.layout === 'select' && gs.length > 1) {
      const items = [
        ...(c.all_tab !== false ? [{ id: '*', label: 'Tutte', icon: 'mdi:view-grid', badge: on || '' }] : []),
        ...gs.map((g) => ({ 
          id: g.id, 
          label: g.name || (g.isSingleEntity ? (h?.states[g.entities[0].entity]?.attributes.friendly_name || g.entities[0].entity) : 'Altre'), 
          icon: g.icon, 
          badge: gOn[g.id] || '' 
        })),
      ];
      const sig = JSON.stringify(items) + this._sel;
      if (sig !== this._csig) {
        this._csig = sig;
        chipsInto(this._chips, items, this._sel, (id) => {
          this._sel = id;
          this._csig = null;
          this._applyLayout();
          this._update();
        });
      }
    }
  }

  _toggle(entityId) {
    const domain = entityId.split('.')[0];
    const state = this._hass?.states?.[entityId]?.state;

    // Non inviare comandi a entità assenti o non disponibili.
    if (!state || state === 'unavailable' || state === 'unknown') {
      if (INFO_ONLY.has(domain) || domain === 'lock') {
        this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
      }
      return;
    }

    if (INFO_ONLY.has(domain)) {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
      return;
    }

    // Le serrature hanno servizi dedicati; non usare homeassistant.toggle.
    if (domain === 'lock') {
      if (state === 'locked') this._hass.callService('lock', 'unlock', { entity_id: entityId });
      else if (state === 'unlocked') this._hass.callService('lock', 'lock', { entity_id: entityId });
      return;
    }

    // L'automazione viene abilitata/disabilitata, non eseguita manualmente.
    if (domain === 'automation') {
      this._hass.callService('automation', state === 'on' ? 'turn_off' : 'turn_on', { entity_id: entityId });
      return;
    }

    if (domain === 'input_button') {
      this._hass.callService('input_button', 'press', { entity_id: entityId });
      return;
    }

    if (ACTION_DOMAINS[domain]) {
      const [d, service] = ACTION_DOMAINS[domain];
      this._hass.callService(d, service, { entity_id: entityId });
    } else {
      this._hass.callService('homeassistant', 'toggle', { entity_id: entityId });
    }
  }

  _turnOff(ids) {
    const on = [...new Set(ids)].filter((id) => this._hass.states[id]?.state === 'on' && !ACTION_DOMAINS[id.split('.')[0]]);
    if (on.length) this._hass.callService('homeassistant', 'turn_off', { entity_id: on });
  }
}

const LumenEditor = makeRoomsEditor({
  domains: ['light', 'switch', 'input_boolean', 'fan', 'automation', 'script', 'scene', 'button', 'sensor', 'binary_sensor', 'lock', 'select'],
  defaults: { layout: 'grid', show_all_off: true, all_tab: true, orb_style: 'orb', orb_scale: 1, show_state: false },
  looseLabel: 'Dispositivi senza stanza (opzionale)',
  schema: [
    { name: 'title', selector: { text: {} } },
    { name: 'layout', selector: { select: { options: LAYOUTS, mode: 'dropdown' } } },
    { type: 'grid', name: '', schema: [
      { name: 'room_columns', selector: { number: { min: 1, max: 6, mode: 'box' } } },
      { name: 'columns', selector: { number: { min: 1, max: 6, mode: 'box' } } },
    ] },
    { name: 'orb_style', selector: { select: { options: ORB_STYLES, mode: 'dropdown' } } },
    { name: 'orb_scale', selector: { number: { min: 0.5, max: 1.8, step: 0.05, mode: 'slider' } } },
    { name: 'show_state', selector: { boolean: {} } },
    { name: 'show_all_off', selector: { boolean: {} } },
    { name: 'all_tab', selector: { boolean: {} } },
    { type: 'grid', name: '', schema: [
      { name: 'color_off', selector: { color_rgb: {} } },
      { name: 'color_on', selector: { color_rgb: {} } },
      { name: 'color_name', selector: { color_rgb: {} } },
    ] },
  ],
  labels: {
    orb_style: 'Stile animazione', orb_scale: 'Dimensione dei pulsanti (tutti insieme)', show_state: 'Mostra la riga di stato sotto il nome (acceso/spento)',
    title: 'Titolo', columns: 'Sfere per riga (vuoto = automatico)', show_all_off: 'Mostra "Spegni tutto"', all_tab: 'Pillola "Tutte" (modalità selezionabile)',
    color_off: 'Colore spento', color_on: 'Colore acceso', color_name: 'Colore dei nomi', use_light_color: 'Usa colore RGB della luce'
  },
});

customElements.define('lumen-orbs-card', LumenOrbsCard);
customElements.define('lumen-orbs-card-editor', LumenEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'lumen-orbs-card',
  name: 'Lumen Orbs (luci 3D)',
  description: 'Sfere di vetro 3D per luci e interruttori con atmosfera animata.',
  preview: true,
});