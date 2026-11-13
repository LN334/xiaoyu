/* UI 工具箱：DOM 构建、格式化、状态徽标、SVG 图表、弹层 */

/* ---------------- DOM ---------------- */
export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class' || key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value; // 仅用于受信任的内联图标/骨架，不用于用户数据
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'value') node.value = value;
      else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'hidden') node[key] = Boolean(value);
      else node.setAttribute(key, value);
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children.flat(4)) {
    if (child === undefined || child === null || child === false) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

export function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(root, ...children) {
  clear(root);
  append(root, children);
  return root;
}

export function icon(name, cls = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------------- 格式化 ---------------- */
const pad = (n) => String(n).padStart(2, '0');
const DAY = 86400000;

function toDate(t) {
  if (!t) return null;
  if (t instanceof Date) return t;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const fmt = {
  num(v, digits = 1) {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  },
  int(v) {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return Math.round(n).toLocaleString('zh-CN');
  },
  auto(v) {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    const abs = Math.abs(n);
    const digits = abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  },
  pct(v, digits = 1) {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
    return `${Number(v).toFixed(digits)}%`;
  },
  money(v, digits = 0) {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
    return `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  },
  time(t) {
    const d = toDate(t); if (!d) return '—';
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
  timeSec(t) {
    const d = toDate(t); if (!d) return '—';
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  },
  date(t) {
    const d = toDate(t); if (!d) return '—';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
  dateTime(t) {
    const d = toDate(t); if (!d) return '—';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
  ago(t) {
    const d = toDate(t); if (!d) return '—';
    const diff = Date.now() - d.getTime();
    if (diff < 0) return '刚刚';
    if (diff < 60000) return `${Math.max(1, Math.round(diff / 1000))} 秒前`;
    if (diff < 3600000) return `${Math.round(diff / 60000)} 分钟前`;
    if (diff < DAY) return `${Math.round(diff / 3600000)} 小时前`;
    if (diff < 7 * DAY) return `${Math.round(diff / DAY)} 天前`;
    return fmt.time(t);
  },
  dur(sec) {
    if (sec === null || sec === undefined || !Number.isFinite(Number(sec))) return '—';
    const s = Math.max(0, Math.round(Number(sec)));
    if (s < 60) return `${s} 秒`;
    if (s < 3600) return `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
    if (s < 86400) return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`;
    return `${Math.floor(s / 86400)} 天 ${Math.floor((s % 86400) / 3600)} 小时`;
  },
  hours(v) {
    if (!Number.isFinite(Number(v))) return '—';
    const n = Number(v);
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k h` : `${Math.round(n)} h`;
  },
  value(reading, digits) {
    if (!reading) return '—';
    if (reading.value === null || reading.value === undefined) return '待接入';
    const v = reading.type === 'state'
      ? (Number(reading.value) ? '运行' : '停止')
      : fmt.auto(reading.value);
    return reading.unit ? `${v} ${reading.unit}` : String(v);
  },
};

/* ---------------- 状态映射 ---------------- */
const LEVELS = {
  critical: ['紧急', 'bad'], major: ['重要', 'warn'], minor: ['次要', 'info'], info: ['提示', 'muted'],
};
const ALARM_STATUS = {
  active: ['未处理', 'bad'], acknowledged: ['已确认', 'warn'], resolved: ['已恢复', 'good'], closed: ['已关闭', 'muted'],
};
const WO_STATUS = {
  pending: ['待接单', 'warn'], accepted: ['已接单', 'info'], processing: ['处理中', 'info'],
  done: ['待验收', 'warn'], verified: ['已验收', 'good'], closed: ['已关闭', 'muted'],
};
const CMD_STATUS = {
  pending_confirm: ['待确认', 'warn'], pending_dispatch: ['待下发', 'info'], sent: ['已下发', 'info'],
  executing: ['执行中', 'info'], success: ['成功', 'good'], failed: ['失败', 'bad'],
  timeout: ['超时', 'bad'], cancelled: ['已取消', 'muted'],
};
const DEVICE_STATUS = {
  running: ['运行', 'good'], standby: ['待机', 'muted'], stopped: ['停机', 'muted'],
  fault: ['故障', 'bad'], maintenance: ['保养中', 'warn'], offline: ['离线', 'bad'], 未安装: ['未安装', 'muted'],
};
const UNIT_STATUS = {
  normal: ['正常', 'good'], alarm: ['告警', 'bad'], attention: ['关注', 'warn'],
  offline: ['离线', 'muted'], stale: ['数据超时', 'warn'], 'no-instrument': ['无在线仪表', 'muted'],
};

export function badge(text, kind = 'muted', title) {
  return el('span', { class: `badge ${kind}`, title }, text);
}

export function dot(kind = 'muted', live = false) {
  return el('span', { class: `dot ${kind}${live ? ' live' : ''}` });
}

function mapped(map, value, fallbackText) {
  const hit = map[value];
  if (!hit) return badge(fallbackText || value || '—', 'muted');
  return badge(hit[0], hit[1]);
}

export const levelBadge = (v) => mapped(LEVELS, v, v);
export const alarmStatus = (v) => mapped(ALARM_STATUS, v, v);
export const woStatus = (v) => mapped(WO_STATUS, v, v);
export const cmdStatus = (v) => mapped(CMD_STATUS, v, v);
export const deviceStatus = (v) => mapped(DEVICE_STATUS, v, v);
export const unitStatus = (v) => mapped(UNIT_STATUS, v, v);

export function qualityBadge(q) {
  if (!q) return badge('未知', 'muted');
  if (q === 'good') return badge('正常', 'good');
  if (q === 'uncertain') return badge('可疑', 'warn');
  if (q === 'bad') return badge('异常', 'bad');
  return badge(String(q), 'muted');
}

export function sourceText(reading) {
  if (!reading) return '—';
  const src = reading.source || reading.provenance;
  if (src === 'drawing') return '图纸点位 · 模拟网关';
  if (src === 'optional') return '选配点位 · 模拟网关';
  if (src === 'gateway') return '现场网关';
  if (src === 'lab') return '人工化验';
  if (src === 'manual') return '人工录入';
  if (src === 'external') return '外部接口';
  return src || '模拟网关';
}

export function staleTag(reading) {
  if (!reading) return null;
  if (reading.stale) return el('span', { class: 'stale-tag', title: '该点位超过 60 秒未更新' }, '数据超时');
  if (reading.provenance === 'optional' && (reading.value === null || reading.value === undefined)) {
    return el('span', { class: 'stale-tag' }, '待接入');
  }
  return null;
}

/* ---------------- 结构组件 ---------------- */
export function pageHead(title, desc, actions) {
  return el('div', { class: 'page-head' },
    el('div', {},
      el('h2', { class: 'page-title' }, title),
    ),
    actions ? el('div', { class: 'page-actions' }, actions) : null,
  );
}

export function card({ title, sub, actions, body, foot, flush = false, class: cls = '' } = {}) {
  return el('section', { class: `card ${cls}` },
    title || actions ? el('div', { class: 'card-head' },
      el('div', {},
        title ? el('h3', { class: 'card-title' }, title) : null,
        sub ? el('p', { class: 'card-sub' }, sub) : null,
      ),
      actions ? el('div', { class: 'row wrap' }, actions) : null,
    ) : null,
    el('div', { class: `card-body${flush ? ' flush' : ''}` }, body),
    foot ? el('div', { class: 'card-foot' }, foot) : null,
  );
}

export function kpi({ label, value, unit, delta, tone = '', hint, iconName }) {
  return el('div', { class: `kpi ${tone ? `tone-${tone}` : ''}` },
    el('div', { class: 'kpi-label' }, iconName ? icon(iconName) : null, label, hint ? el('span', { class: 'muted tiny', title: hint }, 'ⓘ') : null),
    el('div', { class: 'kpi-value' }, String(value ?? '—'), unit ? el('small', {}, unit) : null),
    delta ? el('div', { class: 'kpi-delta' }, delta) : null,
  );
}

export function empty(text, sub, iconName = 'monitor') {
  return el('div', { class: 'empty' },
    icon(iconName),
    el('b', {}, text || '暂无数据'),
    sub ? el('span', {}, sub) : null,
  );
}

export function skeleton(n = 3, cls = 'line') {
  const box = el('div', {});
  for (let i = 0; i < n; i += 1) box.appendChild(el('div', { class: `skeleton ${cls}` }));
  return box;
}

export function loading(text = '加载中…') {
  return el('div', { class: 'loading-line' }, el('span', { class: 'spinner' }), text);
}

export function errorState(err, retry) {
  return el('div', { class: 'empty' },
    icon('warning'),
    el('b', {}, '加载失败'),
    el('span', {}, err && err.message ? err.message : String(err || '未知错误')),
    retry ? el('button', { class: 'btn sm', onclick: retry }, '重试') : null,
  );
}

export function notice(text, kind = '') {
  return el('div', { class: `notice ${kind}` }, icon(kind === 'bad' || kind === 'warn' ? 'warning' : 'check'), el('div', {}, text));
}

export function kv(entries) {
  const dl = el('dl', { class: 'kv' });
  for (const [k, v] of entries) {
    if (v === undefined || v === null || v === '') continue;
    dl.appendChild(el('dt', {}, k));
    dl.appendChild(el('dd', {}, v));
  }
  return dl;
}

export function kvRows(entries) {
  const box = el('div', {});
  for (const [k, v] of entries) {
    if (v === undefined || v === null || v === '') continue;
    box.appendChild(el('div', { class: 'kv-row' }, el('span', { class: 'k' }, k), el('span', { class: 'v' }, v)));
  }
  return box;
}

export function timeline(items) {
  const box = el('div', { class: 'timeline' });
  for (const it of items) {
    box.appendChild(el('div', { class: `timeline-item ${it.tone || ''}` },
      el('div', { class: 'tl-time' }, it.time || ''),
      el('div', { class: 'tl-title' }, it.title || ''),
      it.note ? el('div', { class: 'tl-note' }, it.note) : null,
    ));
  }
  return box;
}

export function progress(value, { max = 100, tone = '', showLabel = false } = {}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (Number(value) / max) * 100)) : 0;
  return el('div', { class: 'row' },
    el('div', { class: `progress ${tone}` }, el('i', { style: { width: `${pct}%` } })),
    showLabel ? el('span', { class: 'tiny muted mono' }, `${fmt.auto(value)}/${fmt.auto(max)}`) : null,
  );
}

export function field(label, control, hint) {
  return el('label', { class: 'field' }, el('span', { class: 'label' }, label), control,
    hint ? el('span', { class: 'hint' }, hint) : null);
}

export function input(attrs = {}) { return el('input', { class: 'input', ...attrs }); }
export function select(options, attrs = {}) {
  const node = el('select', { class: 'select', ...attrs });
  for (const opt of options) {
    const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
    node.appendChild(el('option', { value: o.value, selected: o.selected }, o.label));
  }
  return node;
}
export function textarea(attrs = {}) { return el('textarea', { class: 'textarea', ...attrs }); }

export function tabs(items, active, onChange) {
  const box = el('div', { class: 'tabs' });
  for (const it of items) {
    const b = el('button', { class: `tab ${it.value === active ? 'active' : ''}`, type: 'button', onclick: () => onChange(it.value) }, it.label);
    box.appendChild(b);
  }
  return box;
}

export function segmented(items, active, onChange) {
  const box = el('div', { class: 'segmented' });
  for (const it of items) {
    box.appendChild(el('button', { class: it.value === active ? 'on' : '', type: 'button', onclick: () => onChange(it.value) }, it.label));
  }
  return box;
}

/* 表格：columns=[{key,label,cls,render(row),width}] */
export function table({ columns, rows, emptyText, emptySub, onRow, rowClass, flush = true }) {
  if (!rows || !rows.length) return empty(emptyText || '暂无记录', emptySub);
  const wrap = el('div', { class: `table-wrap${flush ? '' : ''}` });
  const t = el('table', { class: 'data' });
  const thead = el('thead');
  const trh = el('tr');
  for (const col of columns) {
    trh.appendChild(el('th', { class: col.cls || '', style: col.width ? { width: col.width } : undefined }, col.label));
  }
  thead.appendChild(trh);
  const tbody = el('tbody');
  for (const row of rows) {
    const tr = el('tr', { class: `${onRow ? 'clickable' : ''} ${rowClass ? rowClass(row) : ''}` });
    if (onRow) tr.addEventListener('click', (e) => {
      if (e.target.closest('button,a,input,select')) return;
      onRow(row);
    });
    for (const col of columns) {
      const td = el('td', { class: col.cls || '' });
      const val = col.render ? col.render(row) : row[col.key];
      if (val instanceof Node) td.appendChild(val);
      else td.textContent = val === undefined || val === null || val === '' ? '—' : String(val);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  t.append(thead, tbody);
  wrap.appendChild(t);
  return wrap;
}

/* ---------------- SVG 图表 ---------------- */
const PALETTE = ['#0b7a70', '#1f6fb2', '#c0762a', '#8a4fa3', '#157f4b', '#b32d22'];
const PALETTE_DARK = ['#4fd1c5', '#63b3ed', '#e0b25a', '#b794f4', '#68d391', '#ef8f84'];
function activePalette() {
  const dark = typeof document !== 'undefined' && document.body && document.body.dataset.theme === 'dark';
  return dark ? PALETTE_DARK : PALETTE;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    node.setAttribute(k, v);
  }
  return node;
}

function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(step0 || 1));
  const norm = step0 / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/* 折线图：series=[{name,color,points:[{t,v}]}] */
export function chartLine(container, { series = [], height = 220, yMin, yMax, unit = '', digits, area = true, xTickCount = 4, showLegend = true, fillHeight = false }) {
  clear(container);
  const W = Math.max(320, container.clientWidth || 640);
  const H = height;
  const box = { l: 44, r: 12, t: 12, b: 22 };
  const iw = W - box.l - box.r;
  const ih = H - box.t - box.b;
  const all = series.flatMap((s) => s.points || []);
  const times = all.map((p) => new Date(p.t).getTime()).filter(Number.isFinite);
  let t0 = Math.min(...times);
  let t1 = Math.max(...times);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) { t0 = Date.now() - 3600000; t1 = Date.now(); }
  if (t1 === t0) { t0 -= 60000; t1 += 60000; }
  let values = all.map((p) => Number(p.v)).filter((v) => Number.isFinite(v));
  let lo = yMin !== undefined ? yMin : Math.min(...values);
  let hi = yMax !== undefined ? yMax : Math.max(...values);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (lo === hi) { lo -= 1; hi += 1; }
  if (yMin === undefined) lo = lo - (hi - lo) * 0.12;
  if (yMax === undefined) hi = hi + (hi - lo) * 0.12;
  const ticks = niceTicks(lo, hi, 4);
  lo = Math.min(lo, ticks[0]);
  hi = Math.max(hi, ticks[ticks.length - 1]);

  const x = (t) => box.l + ((new Date(t).getTime() - t0) / (t1 - t0)) * iw;
  const y = (v) => box.t + ih - ((v - lo) / (hi - lo)) * ih;

  const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: '100%', height: fillHeight ? '100%' : H, preserveAspectRatio: 'none', role: 'img', 'aria-label': '趋势图' });
  svg.style.display = 'block';
  if (fillHeight) { svg.style.height = '100%'; svg.style.width = '100%'; }

  for (const tick of ticks) {
    const yy = y(tick);
    if (yy < box.t - 1 || yy > box.t + ih + 1) continue;
    svg.appendChild(svgEl('line', { x1: box.l, x2: W - box.r, y1: yy, y2: yy, class: 'grid-line' }));
    const label = svgEl('text', { x: box.l - 7, y: yy + 3.5, 'text-anchor': 'end' });
    label.textContent = Number.isInteger(tick) ? String(tick) : tick.toFixed(Math.abs(tick) < 10 ? 1 : 0);
    svg.appendChild(label);
  }

  // x 轴标签：跨度超过 3 天只显示「MM-DD」，并按可用宽度收缩刻度数量，避免小卡片上文字互相压叠
  const spanMs = t1 - t0;
  const dateOnly = spanMs > 2.5 * 86400000;
  const innerW = W - box.l - box.r;
  const perLabel = dateOnly ? 30 : 84;
  const fitCount = Math.max(2, Math.min(xTickCount, 6, Math.floor(innerW / perLabel) + 1));
  const xCount = fitCount;
  for (let i = 0; i < xCount; i += 1) {
    const tt = t0 + (spanMs * i) / (xCount - 1);
    const xx = x(tt);
    const label = svgEl('text', { x: Math.min(Math.max(xx, box.l + 12), W - box.r - 14), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === xCount - 1 ? 'end' : 'middle' });
    const d = new Date(tt);
    const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    label.textContent = dateOnly ? md : `${md} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    svg.appendChild(label);
  }

  series.forEach((s, idx) => {
    const color = s.color || activePalette()[idx % activePalette().length];
    const pts = (s.points || []).filter((p) => p.v !== null && Number.isFinite(Number(p.v)));
    if (!pts.length) return;
    let d = '';
    pts.forEach((p, i) => { d += `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(2)},${y(Number(p.v)).toFixed(2)}`; });
    if (area && series.length <= 2) {
      const areaD = `${d}L${x(pts[pts.length - 1].t).toFixed(2)},${box.t + ih}L${x(pts[0].t).toFixed(2)},${box.t + ih}Z`;
      svg.appendChild(svgEl('path', { d: areaD, fill: color, class: 'series-area' }));
    }
    svg.appendChild(svgEl('path', { d, class: 'series-line', stroke: color }));
    const last = pts[pts.length - 1];
    svg.appendChild(svgEl('circle', { cx: x(last.t), cy: y(Number(last.v)), r: 3, fill: color }));
  });

  svg.appendChild(svgEl('line', { x1: box.l, x2: W - box.r, y1: box.t + ih, y2: box.t + ih, class: 'axis-line' }));
  container.appendChild(svg);

  if (showLegend && series.length > 0) {
    const legend = el('div', { class: 'chart-legend' });
    series.forEach((s, idx) => {
      legend.appendChild(el('span', {},
        el('i', { style: { background: s.color || activePalette()[idx % activePalette().length] } }),
        `${s.name || `序列 ${idx + 1}`}${unit ? `（${unit}）` : ''}`,
      ));
    });
    container.appendChild(legend);
  }
  return svg;
}

export function sparkline(points, { width = 120, height = 30, color = '#0b7a70', area = true } = {}) {
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'chart', role: 'img', 'aria-label': '迷你趋势' });
  const vals = points.map((p) => Number(p.v)).filter(Number.isFinite);
  if (!vals.length) return svg;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const p = 2;
  const xy = points.map((pt, i) => {
    const xx = p + (i / Math.max(1, points.length - 1)) * (width - p * 2);
    const yy = height - p - ((Number(pt.v) - lo) / span) * (height - p * 2);
    return [xx, yy];
  });
  let d = '';
  xy.forEach(([xx, yy], i) => { d += `${i === 0 ? 'M' : 'L'}${xx.toFixed(2)},${yy.toFixed(2)}`; });
  if (area) {
    svg.appendChild(svgEl('path', { d: `${d}L${width - p},${height}L${p},${height}Z`, fill: color, opacity: '.1' }));
  }
  svg.appendChild(svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': '1.6', 'stroke-linecap': 'round' }));
  const [lx, ly] = xy[xy.length - 1];
  svg.appendChild(svgEl('circle', { cx: lx, cy: ly, r: 2, fill: color }));
  return svg;
}

export function chartBars(container, { items = [], height = 200, color = '#0b7a70', unit = '', valueFmt }) {
  clear(container);
  const W = Math.max(320, container.clientWidth || 640);
  const H = height;
  const box = { l: 42, r: 10, t: 10, b: 26 };
  const iw = W - box.l - box.r;
  const ih = H - box.t - box.b;
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': '柱状图' });
  const ticks = niceTicks(0, max, 3);
  for (const tick of ticks) {
    const yy = box.t + ih - (tick / ticks[ticks.length - 1]) * ih;
    svg.appendChild(svgEl('line', { x1: box.l, x2: W - box.r, y1: yy, y2: yy, class: 'grid-line' }));
    const label = svgEl('text', { x: box.l - 7, y: yy + 3.5, 'text-anchor': 'end' });
    label.textContent = Number.isInteger(tick) ? String(tick) : tick.toFixed(1);
    svg.appendChild(label);
  }
  const band = iw / Math.max(1, items.length);
  const bw = Math.min(38, band * 0.6);
  items.forEach((it, i) => {
    const v = Number(it.value) || 0;
    const h = (v / ticks[ticks.length - 1]) * ih;
    const xx = box.l + band * i + (band - bw) / 2;
    const yy = box.t + ih - h;
    const rect = svgEl('rect', { x: xx, y: yy, width: bw, height: Math.max(1, h), rx: 3, fill: it.color || color, opacity: it.dim ? '.45' : '1' });
    rect.appendChild(svgEl('title', {})).textContent = `${it.label}: ${valueFmt ? valueFmt(v) : fmt.auto(v)}${unit}`;
    svg.appendChild(rect);
    if (items.length <= 14) {
      const label = svgEl('text', { x: xx + bw / 2, y: H - 8, 'text-anchor': 'middle' });
      label.textContent = it.label;
      svg.appendChild(label);
    }
  });
  container.appendChild(svg);
  return svg;
}

export function chartDonut(container, { items = [], size = 150, thickness = 16, centerLabel, centerValue, unit = '' }) {
  clear(container);
  const total = items.reduce((s, i) => s + (Number(i.value) || 0), 0);
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: '100%', height: size, class: 'chart', role: 'img', 'aria-label': '构成图' });
  const r = size / 2 - thickness / 2 - 2;
  const c = size / 2;
  if (total <= 0) {
    svg.appendChild(svgEl('circle', { cx: c, cy: c, r, fill: 'none', stroke: '#e9f0f4', 'stroke-width': thickness }));
  } else {
    const circ = 2 * Math.PI * r;
    let offset = 0;
    items.forEach((it, i) => {
      const v = Number(it.value) || 0;
      const len = (v / total) * circ;
      const circle = svgEl('circle', {
        cx: c, cy: c, r, fill: 'none',
        stroke: it.color || activePalette()[i % activePalette().length], 'stroke-width': thickness,
        'stroke-dasharray': `${Math.max(0, len - 1.5)} ${circ}`, 'stroke-dashoffset': -(offset) + circ / 4,
        'stroke-linecap': 'butt',
      });
      circle.appendChild(svgEl('title', {})).textContent = `${it.label}: ${v}${unit}`;
      svg.appendChild(circle);
      offset += len;
    });
  }
  if (centerValue !== undefined) {
    const v = svgEl('text', { x: c, y: c + 4, 'text-anchor': 'middle', style: 'font-size:18px;font-weight:650;fill:#0e2230' });
    v.textContent = String(centerValue);
    svg.appendChild(v);
    if (centerLabel) {
      const l = svgEl('text', { x: c, y: c + 20, 'text-anchor': 'middle', style: 'font-size:10px;fill:#5d7484' });
      l.textContent = centerLabel;
      svg.appendChild(l);
    }
  }
  container.appendChild(svg);
  const legend = el('div', { class: 'chart-legend' });
  for (const it of items) {
    legend.appendChild(el('span', {}, el('i', { style: { background: it.color || activePalette()[items.indexOf(it) % activePalette().length] } }), `${it.label} ${it.value}${unit}`));
  }
  container.appendChild(legend);
  return svg;
}

export function palette(i) { return PALETTE[i % PALETTE.length]; }

/* ---------------- 弹层 ---------------- */
let toastSeq = 0;
export function toast(message, type = 'info', ms = 3200) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = el('div', { class: `toast ${type}` },
    icon(type === 'success' ? 'check' : type === 'error' ? 'warning' : 'monitor'),
    el('div', { class: 'toast-text' }, String(message)),
  );
  node.dataset.id = String(++toastSeq);
  root.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s, transform .2s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 220);
  }, ms);
  return node;
}

export function modal({ title, sub, body, footer, wide = false, xwide = false, onClose, closeOnBackdrop = true } = {}) {
  const root = document.getElementById('modal-root');
  const previous = document.activeElement;
  clear(root);
  root.hidden = false;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.hidden = true;
    clear(root);
    document.removeEventListener('keydown', onKey);
    if (previous && previous.focus) previous.focus();
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey);
  const box = el('div', { class: `modal${wide ? ' wide' : ''}${xwide ? ' xwide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '对话框' },
    el('div', { class: 'modal-head' },
      el('div', {}, el('h3', {}, title || ''), sub ? el('p', { class: 'card-sub' }, sub) : null),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': '关闭', onclick: close }, icon('close')),
    ),
    el('div', { class: 'modal-body' }, body || null),
    footer ? el('div', { class: 'modal-foot' }, footer) : null,
  );
  root.appendChild(box);
  root.onclick = (e) => { if (closeOnBackdrop && e.target === root) close(); };
  const focusable = box.querySelector('input,select,textarea,button');
  if (focusable) setTimeout(() => focusable.focus(), 30);
  return { close, root, box };
}

export function confirm({ title = '请确认', message = '', detail = null, confirmText = '确认', cancelText = '取消', danger = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const m = modal({
      title,
      body: el('div', {},
        el('p', { class: 'confirm-msg' }, message),
        detail ? el('div', { class: danger ? 'danger-box' : 'notice' }, detail) : null,
      ),
      footer: el('div', { class: 'row', style: { width: '100%' } },
        el('span', { class: 'spacer' }),
        el('button', { class: 'btn', type: 'button', onclick: () => { m.close(); done(false); } }, cancelText),
        el('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => { m.close(); done(true); } }, confirmText),
      ),
      onClose: () => done(false),
    });
  });
}

export function drawer({ title, body, sub } = {}) {
  const root = document.getElementById('drawer-root');
  clear(root);
  root.hidden = false;
  const close = () => { root.hidden = true; clear(root); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const box = el('div', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '详情' },
    el('div', { class: 'drawer-head' }, el('div', {}, el('h3', {}, title || ''), sub ? el('p', { class: 'card-sub' }, sub) : null),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': '关闭', onclick: close }, icon('close'))),
    el('div', { class: 'drawer-body' }, body || null),
  );
  root.appendChild(box);
  root.onclick = (e) => { if (e.target === root) close(); };
  return { close, root, box };
}
