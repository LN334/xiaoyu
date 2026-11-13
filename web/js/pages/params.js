import * as ui from '../ui.js';

export const meta = { title: '工艺参数' };

const { el, fmt } = ui;

const MODE_META = {
  cloud: { label: '云端直接写入', kind: 'info', note: '提交后立即生效，生成新版本并记录操作人、理由与时间。' },
  approval: { label: '审批后生效', kind: 'warn', note: '提交后生成变更申请并通知工艺/区域负责人，审批通过后才写入。' },
  local: { label: '现场设定', kind: 'muted', note: '该参数仅允许现场就地设定，平台不提供远程写入。' },
  read: { label: '只读', kind: 'muted', note: '该参数由系统维护，平台内不可修改。' },
};

const REQ_STATUS = {
  pending_approval: { label: '待审批', kind: 'warn' },
  approved: { label: '已通过', kind: 'good' },
  rejected: { label: '已驳回', kind: 'bad' },
};

function modeMeta(mode) {
  return MODE_META[mode] || { label: mode || '未知', kind: 'muted', note: '' };
}

export async function render(root, ctx) {
  const perms = (ctx.user && ctx.user.perms) || [];
  const canEdit = perms.includes('param.edit');
  const qTab = ctx.query && ctx.query.tab === 'requests' ? 'requests' : 'list';

  const state = {
    tab: qTab,
    params: [],
    groups: [],
    paramsLoading: true,
    paramsError: null,
    requests: [],
    reqMeta: null,
    requestsLoading: true,
    requestsError: null,
    lastUpdated: 0,
    busy: false,
  };

  const updatedLabel = el('span', { class: 'tiny muted mono' }, '');
  const refreshBtn = el('button', { class: 'btn ghost', type: 'button' }, ui.icon('refresh'), '刷新');
  const statsHost = el('div', { class: 'stat-strip' });
  const tabsHost = el('div', { class: 'tabs-host' });
  const bodyHost = el('div', { class: 'tabs-body' });
  const legendHost = el('div', { class: 'mode-legend' });

  const page = el('div', { class: 'page p-params' },
    ui.pageHead(
      '工艺参数',
      `工艺单元运行参数与写入策略，变更全部留痕并生成版本。站点：${ctx.site ? ctx.site.name : ctx.siteId}。`,
      el('div', { class: 'row' }, updatedLabel, refreshBtn),
    ),
    canEdit ? null : ui.notice('当前角色只读：可查看参数与审批记录，不能修改参数或审批申请。', 'warn'),
    legendHost,
    statsHost,
    el('section', { class: 'card params-card' },
      el('div', { class: 'card-head' }, tabsHost),
      bodyHost,
    ),
  );

  ui.mount(root, page);

  /* ---------- 工具 ---------- */
  function renderLegend() {
    ui.clear(legendHost);
    legendHost.append(el('div', { class: 'status-chips' }, ['cloud', 'approval', 'local', 'read'].map((key) => {
      const m = modeMeta(key);
      return el('span', { class: 'chip', title: m.note }, ui.dot(m.kind), m.label);
    })));
  }

  function renderUpdated() {
    updatedLabel.textContent = state.lastUpdated ? `最近更新 ${fmt.timeSec(state.lastUpdated)}` : '';
  }

  function rangeText(p) {
    const parts = [`${fmt.auto(p.min)} – ${fmt.auto(p.max)}`];
    if (p.step) parts.push(`步长 ${fmt.auto(p.step)}`);
    return parts.join(' · ');
  }

  /* ---------- 加载 ---------- */
  async function loadParams() {
    state.paramsLoading = true;
    renderBody();
    try {
      const res = await ctx.api.getFull('/api/params', { siteId: ctx.siteId });
      state.params = res.data || [];
      state.groups = (res.meta && res.meta.groups) || [];
      state.paramsError = null;
      state.lastUpdated = Date.now();
    } catch (err) {
      state.paramsError = err;
      state.params = [];
      state.groups = [];
    } finally {
      state.paramsLoading = false;
      renderBody();
      renderStats();
      renderUpdated();
    }
  }

  async function loadRequests() {
    state.requestsLoading = true;
    renderBody();
    try {
      const res = await ctx.api.getFull('/api/param-requests', { siteId: ctx.siteId });
      state.requests = res.data || [];
      state.reqMeta = res.meta || {};
      state.requestsError = null;
      state.lastUpdated = Date.now();
    } catch (err) {
      state.requestsError = err;
      state.requests = [];
      state.reqMeta = null;
    } finally {
      state.requestsLoading = false;
      renderBody();
      renderStats();
      renderUpdated();
    }
  }

  /* ---------- 统计 ---------- */
  function renderStats() {
    ui.clear(statsHost);
    const counts = { cloud: 0, approval: 0, local: 0, read: 0 };
    for (const p of state.params) {
      if (counts[p.writeMode] != null) counts[p.writeMode] += 1;
    }
    const pending = (state.reqMeta && state.reqMeta.pending) || 0;
    statsHost.append(
      ui.kpi({ label: '参数总数', value: state.params.length, unit: '项', hint: `${state.groups.length} 个工艺单元分组`, iconName: 'params' }),
      ui.kpi({ label: '云端直接写入', value: counts.cloud, unit: '项', hint: '提交即生效，生成新版本', iconName: 'control' }),
      ui.kpi({ label: '审批后生效', value: counts.approval, unit: '项', hint: '需工艺/区域负责人审批', iconName: 'workorder' }),
      ui.kpi({ label: '现场设定 / 只读', value: counts.local + counts.read, unit: '项', hint: '平台不可远程写入', iconName: 'device' }),
      ui.kpi({
        label: '待审批申请',
        value: pending,
        unit: '条',
        tone: pending ? 'warn' : '',
        hint: '审批页签可处理',
        iconName: 'bell',
      }),
    );
  }

  /* ---------- 页签与主体 ---------- */
  function renderTabs() {
    ui.clear(tabsHost);
    const pending = (state.reqMeta && state.reqMeta.pending) || 0;
    tabsHost.append(ui.tabs(
      [
        { value: 'list', label: '参数清单' },
        { value: 'requests', label: `审批申请${pending ? ` (${pending})` : ''}` },
      ],
      state.tab,
      (value) => {
        if (value === state.tab) return;
        state.tab = value;
        syncUrl();
        renderTabs();
        renderBody();
        if (value === 'requests' && !state.requests.length && !state.requestsLoading) loadRequests();
      },
    ));
  }

  function syncUrl() {
    try {
      const base = '#/params';
      const url = state.tab === 'requests' ? `${base}?tab=requests` : base;
      history.replaceState(null, '', url);
    } catch (err) {
      /* 无历史 API 时忽略 */
    }
  }

  function renderBody() {
    ui.clear(bodyHost);
    if (state.tab === 'list') renderParamList();
    else renderRequests();
  }

  /* ---------- 参数清单 ---------- */
  function renderParamList() {
    if (state.paramsLoading && !state.params.length) {
      bodyHost.append(el('div', { class: 'tabs-pad' }, ui.skeleton(6, 'line')));
      return;
    }
    if (state.paramsError) {
      bodyHost.append(el('div', { class: 'tabs-pad' }, ui.errorState(state.paramsError, () => loadParams())));
      return;
    }
    if (!state.params.length) {
      bodyHost.append(el('div', { class: 'tabs-pad' }, ui.empty('暂无工艺参数', '请检查站点范围或稍后刷新')));
      return;
    }
    const groups = state.groups.length ? state.groups : [...new Set(state.params.map((p) => p.group))];
    for (const group of groups) {
      const list = state.params.filter((p) => p.group === group);
      if (!list.length) continue;
      bodyHost.append(ui.card({
        title: group,
        sub: `${list.length} 项参数`,
        class: 'param-group',
        flush: true,
        body: paramTable(list),
      }));
    }
  }

  function paramTable(list) {
    return ui.table({
      columns: [
        {
          key: 'name',
          label: '参数',
          render: (row) => el('div', { class: 'cell-main' },
            el('span', { class: 'cell-title' }, row.name),
            el('span', { class: 'cell-sub mono' }, row.key),
          ),
        },
        {
          key: 'currentValue',
          label: '当前值',
          width: '116px',
          cls: 'num',
          render: (row) => el('span', { class: 'param-value' }, fmt.auto(row.currentValue), el('small', { class: 'unit' }, row.unit || '')),
        },
        { key: 'range', label: '范围', width: '132px', render: (row) => el('span', { class: 'mono tiny' }, rangeText(row)) },
        {
          key: 'writeMode',
          label: '写入模式',
          width: '132px',
          render: (row) => {
            const m = modeMeta(row.writeMode);
            return el('div', { class: 'mode-cell' },
              ui.badge(m.label, m.kind, m.note),
              row.pendingRequest ? ui.badge('待审批', 'warn', `申请 ${fmt.auto(row.pendingRequest.value)}${row.unit || ''} · ${row.pendingRequest.requestedBy || ''}`) : null,
            );
          },
        },
        {
          key: 'version',
          label: '版本',
          width: '70px',
          cls: 'num',
          render: (row) => el('span', { class: 'mono' }, `v${row.version}`),
        },
        {
          key: 'updatedAt',
          label: '更新时间',
          width: '150px',
          render: (row) => el('div', { class: 'cell-main' },
            el('span', { class: 'cell-sub' }, fmt.dateTime(row.updatedAt)),
            el('span', { class: 'cell-sub tiny muted' }, row.updatedByName || '—'),
          ),
        },
        {
          key: 'op',
          label: '操作',
          width: '128px',
          render: (row) => el('div', { class: 'row wrap op-cell' },
            editButton(row),
            el('button', {
              class: 'btn ghost sm', type: 'button',
              onclick: (ev) => { ev.stopPropagation(); openParamDrawer(row); },
            }, '历史'),
          ),
        },
      ],
      rows: list,
      onRow: (row) => openParamDrawer(row),
    });
  }

  function editButton(p) {
    if (!canEdit) {
      return el('button', { class: 'btn ghost sm', type: 'button', disabled: true, title: '当前角色无参数编辑权限' }, '编辑');
    }
    if (p.writeMode === 'local') {
      return el('button', { class: 'btn ghost sm', type: 'button', disabled: true, title: '须现场就地设定' }, '现场设定');
    }
    if (p.writeMode === 'read') {
      return el('button', { class: 'btn ghost sm', type: 'button', disabled: true, title: '该参数为只读' }, '只读');
    }
    if (p.pendingRequest) {
      return el('button', { class: 'btn ghost sm', type: 'button', disabled: true, title: '已有待审批的变更申请，请先处理' }, '待审批');
    }
    return el('button', {
      class: 'btn primary sm', type: 'button',
      onclick: (ev) => { ev.stopPropagation(); openEditModal(p); },
    }, p.writeMode === 'approval' ? '申请变更' : '编辑');
  }

  /* ---------- 编辑弹窗 ---------- */
  function openEditModal(p) {
    if (!canEdit) {
      ui.toast('当前角色无参数编辑权限', 'error');
      return;
    }
    const m = modeMeta(p.writeMode);
    const valueInput = ui.input({
      type: 'number',
      value: String(p.currentValue),
      min: p.min,
      max: p.max,
      step: p.step || 1,
    });
    const reason = ui.textarea({
      rows: 3,
      maxlength: 300,
      placeholder: '必填：说明调整原因与依据，例如「进水 COD 上升，需将 PAC 投加量上调至 1.6 L/h」',
    });
    const errBox = el('div', { class: 'error-text', hidden: true });
    const cancelBtn = el('button', { class: 'btn', type: 'button' }, '取消');
    const submitBtn = el('button', { class: 'btn primary', type: 'button' }, p.writeMode === 'approval' ? '提交审批' : '提交变更');

    const body = el('div', { class: 'stack tight' },
      el('div', { class: 'row wrap' },
        ui.badge(m.label, m.kind, m.note),
        ui.badge(`v${p.version}`, 'muted', '当前版本'),
      ),
      ui.kv([
        ['参数', `${p.name}（${p.key}）`],
        ['当前值', `${fmt.auto(p.currentValue)} ${p.unit || ''}`],
        ['允许范围', `${rangeText(p)} ${p.unit || ''}`],
        ['所属分组', p.group],
        ['上次更新', `${fmt.dateTime(p.updatedAt)} · ${p.updatedByName || '—'}`],
      ]),
      el('div', { class: 'impact-box' },
        el('div', { class: 'impact-title' }, '写入方式与影响'),
        el('p', {}, m.note),
        p.desc ? el('p', { class: 'tiny muted' }, `参数说明：${p.desc}`) : null,
      ),
      ui.field('新值', valueInput, `允许范围 ${fmt.auto(p.min)} – ${fmt.auto(p.max)} ${p.unit || ''}，步长 ${fmt.auto(p.step || 1)}。`),
      ui.field('变更理由（必填）', reason, '写入版本记录与审计日志，审批模式下会展示给审批人。'),
      errBox,
    );

    const modal = ui.modal({
      title: `修改参数：${p.name}`,
      sub: `${p.group} · ${m.label}`,
      body,
      footer: el('div', { class: 'row', style: { width: '100%' } }, el('span', { class: 'spacer' }), cancelBtn, submitBtn),
    });
    cancelBtn.addEventListener('click', () => modal.close());
    valueInput.focus();
    valueInput.select();

    const showErr = (msg) => {
      errBox.hidden = false;
      errBox.textContent = msg;
    };

    submitBtn.addEventListener('click', async () => {
      if (state.busy) return;
      errBox.hidden = true;
      const raw = String(valueInput.value == null ? '' : valueInput.value).trim();
      if (raw === '') {
        showErr('请填写新值');
        valueInput.focus();
        return;
      }
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        showErr('参数值必须是数字');
        valueInput.focus();
        return;
      }
      if (num < Number(p.min) || num > Number(p.max)) {
        showErr(`取值须在 ${p.min}–${p.max} ${p.unit || ''} 之间`);
        valueInput.focus();
        return;
      }
      const text = reason.value.trim();
      if (!text) {
        showErr('请填写变更理由');
        reason.focus();
        return;
      }

      state.busy = true;
      submitBtn.disabled = true;
      cancelBtn.disabled = true;
      const label = submitBtn.textContent;
      submitBtn.textContent = '提交中…';
      try {
        const res = await ctx.api.post(`/api/params/${encodeURIComponent(p.id)}/change`, { value: num, reason: text });
        modal.close();
        if (res && res.applied) {
          ui.toast(`参数已生效，生成版本 v${res.version && res.version.version != null ? res.version.version : ''}`.replace(/\s+$/, ''), 'success');
        } else {
          ui.toast('已生成变更申请并通知审批人', 'info', 4200);
        }
        await Promise.all([loadParams(), loadRequests()]);
      } catch (err) {
        showErr(err && err.message ? err.message : '提交失败，请稍后重试');
      } finally {
        state.busy = false;
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
        submitBtn.textContent = label;
      }
    });
  }

  /* ---------- 版本历史抽屉 ---------- */
  async function openParamDrawer(p) {
    const body = el('div', { class: 'stack drawer-stack' }, ui.loading('正在读取参数详情…'));
    const dr = ui.drawer({ title: '参数详情与版本', sub: `${p.group} · ${p.name}`, body });
    let detail = p;
    try {
      const fetched = await ctx.api.get(`/api/params/${encodeURIComponent(p.id)}`);
      if (fetched) detail = fetched;
    } catch (err) {
      /* 列表数据已足够展示概要，详情接口异常时回退 */
    }
    ui.clear(body);
    const versions = Array.isArray(detail.versions) ? detail.versions : [];
    const mode = modeMeta(detail.writeMode);
    const currentVersion = detail.version;

    const versionRows = versions.map((v) => ({
      version: v.version,
      value: v.value,
      status: v.status,
      operatorName: v.operatorName,
      reason: v.reason,
      createdAt: v.createdAt,
    }));

    body.append(
      el('div', { class: 'detail-top' },
        el('div', { class: 'row wrap' },
          ui.badge(mode.label, mode.kind, mode.note),
          ui.badge(`当前 v${detail.version}`, 'muted'),
          detail.pendingRequest ? ui.badge(`待审批 → ${fmt.auto(detail.pendingRequest.value)}${detail.unit || ''}`, 'warn') : null,
        ),
        el('h3', { class: 'detail-title' }, detail.name),
        el('p', { class: 'detail-desc mono' }, detail.key),
      ),
      ui.card({
        title: '当前配置',
        body: ui.kv([
          ['当前值', `${fmt.auto(detail.currentValue)} ${detail.unit || ''}`],
          ['允许范围', `${rangeText(detail)} ${detail.unit || ''}`],
          ['写入模式', mode.label],
          ['所属分组', detail.group || '—'],
          ['参数说明', detail.desc || '—'],
          ['上次更新', `${fmt.dateTime(detail.updatedAt)} · ${detail.updatedByName || '—'}`],
        ]),
      }),
      ui.card({
        title: '版本历史',
        sub: '每次生效变更生成新版本',
        flush: true,
        body: versions.length
          ? ui.table({
            columns: [
              { key: 'version', label: '版本', width: '62px', render: (v) => el('span', { class: 'mono' }, `v${v.version}`) },
              { key: 'value', label: '值', width: '92px', cls: 'num', render: (v) => `${fmt.auto(v.value)} ${detail.unit || ''}` },
              {
                key: 'status',
                label: '状态',
                width: '72px',
                render: (v) => (v.status === 'active' ? ui.badge('生效中', 'good') : ui.badge('历史', 'muted')),
              },
              { key: 'operatorName', label: '操作人', width: '84px', render: (v) => v.operatorName || '—' },
              {
                key: 'reason',
                label: '理由',
                render: (v) => el('span', { class: 'reason-cell', title: v.reason || '' }, v.reason || '—'),
              },
              { key: 'createdAt', label: '时间', width: '124px', render: (v) => el('span', { class: 'mono tiny' }, fmt.dateTime(v.createdAt)) },
              {
                key: 'op',
                label: '',
                width: '78px',
                render: (v) => (canEdit && v.version !== currentVersion
                  ? el('button', {
                    class: 'btn ghost sm', type: 'button',
                    onclick: (ev) => { ev.stopPropagation(); dr.close(); openRollbackModal(detail, v); },
                  }, '回滚')
                  : el('span', { class: 'tiny muted' }, v.version === currentVersion ? '当前' : '—')),
              },
            ],
            rows: versionRows,
            emptyText: '暂无版本记录',
          })
          : ui.empty('暂无版本记录', '参数尚未发生变更'),
      }),
      el('div', { class: 'drawer-actions' },
        el('p', { class: 'tiny muted' }, canEdit
          ? '变更与回滚均需填写理由，并写入审计日志。'
          : '当前角色只读，不可修改参数。'),
      ),
    );
  }

  function openRollbackModal(param, version) {
    const reason = ui.textarea({
      rows: 3,
      maxlength: 300,
      placeholder: '必填：说明回滚原因，例如「投加量上调后出水色度异常，回退至上一稳定值」',
    });
    const errBox = el('div', { class: 'error-text', hidden: true });
    const cancelBtn = el('button', { class: 'btn', type: 'button' }, '取消');
    const submitBtn = el('button', { class: 'btn danger', type: 'button' }, '确认回滚');
    const body = el('div', { class: 'stack tight' },
      ui.notice(`回滚会把「${param.name}」从当前值 ${fmt.auto(param.currentValue)}${param.unit || ''} 恢复为 v${version.version} 的 ${fmt.auto(version.value)}${param.unit || ''}，并生成一个新版本。`, 'warn'),
      ui.kv([
        ['参数', `${param.name}（${param.key}）`],
        ['目标版本', `v${version.version}（${version.operatorName || '—'} · ${fmt.dateTime(version.createdAt)}）`],
        ['目标值', `${fmt.auto(version.value)} ${param.unit || ''}`],
        ['原变更理由', version.reason || '—'],
      ]),
      ui.field('回滚理由（必填）', reason, '写入新版本记录与审计日志。'),
      errBox,
    );
    const modal = ui.modal({
      title: `回滚参数：${param.name}`,
      sub: `目标版本 v${version.version}`,
      body,
      footer: el('div', { class: 'row', style: { width: '100%' } }, el('span', { class: 'spacer' }), cancelBtn, submitBtn),
    });
    cancelBtn.addEventListener('click', () => modal.close());
    reason.focus();

    submitBtn.addEventListener('click', async () => {
      if (state.busy) return;
      errBox.hidden = true;
      const text = reason.value.trim();
      if (!text) {
        errBox.hidden = false;
        errBox.textContent = '请填写回滚理由';
        reason.focus();
        return;
      }
      const ok = await ctx.confirm({
        title: '二次确认回滚',
        message: `确认将「${param.name}」回滚至 v${version.version}？`,
        detail: `当前值：${fmt.auto(param.currentValue)}${param.unit || ''}\n目标值：${fmt.auto(version.value)}${param.unit || ''}\n理由：${text}`,
        confirmText: '确认回滚',
        danger: true,
      });
      if (!ok) return;
      state.busy = true;
      submitBtn.disabled = true;
      cancelBtn.disabled = true;
      try {
        const res = await ctx.api.post(`/api/params/${encodeURIComponent(param.id)}/rollback`, { version: version.version, reason: text });
        modal.close();
        const nv = res && res.version && res.version.version != null ? res.version.version : '';
        ui.toast(`已回滚并生成版本${nv ? ` v${nv}` : ''}`, 'success');
        await Promise.all([loadParams(), loadRequests()]);
      } catch (err) {
        errBox.hidden = false;
        errBox.textContent = err && err.message ? err.message : '回滚失败，请稍后重试';
      } finally {
        state.busy = false;
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });
  }

  /* ---------- 审批页签 ---------- */
  function renderRequests() {
    if (state.requestsLoading && !state.requests.length) {
      bodyHost.append(el('div', { class: 'tabs-pad' }, ui.skeleton(5, 'line')));
      return;
    }
    if (state.requestsError) {
      bodyHost.append(el('div', { class: 'tabs-pad' }, ui.errorState(state.requestsError, () => loadRequests())));
      return;
    }
    if (!state.requests.length) {
      bodyHost.append(el('div', { class: 'tabs-pad' }, ui.empty('暂无参数变更申请', '审批模式下提交变更后，申请会出现在这里')));
      return;
    }
    bodyHost.append(ui.table({
      columns: [
        {
          key: 'paramName',
          label: '参数',
          render: (row) => el('div', { class: 'cell-main' },
            el('span', { class: 'cell-title' }, row.paramName || row.paramKey),
            el('span', { class: 'cell-sub mono' }, `${row.paramId || ''}${row.siteName ? ` · ${row.siteName}` : ''}`),
          ),
        },
        {
          key: 'change',
          label: '变更',
          width: '150px',
          render: (row) => el('span', { class: 'change-cell' },
            el('span', { class: 'mono' }, `${fmt.auto(row.currentValue)}`),
            ' → ',
            el('span', { class: 'mono strong' }, `${fmt.auto(row.value)}${row.unit || ''}`),
          ),
        },
        {
          key: 'requestedByName',
          label: '申请人',
          width: '92px',
          render: (row) => el('div', { class: 'cell-main' },
            el('span', {}, row.requestedByName || '—'),
            el('span', { class: 'cell-sub tiny muted' }, fmt.dateTime(row.createdAt)),
          ),
        },
        {
          key: 'reason',
          label: '申请理由',
          render: (row) => el('span', { class: 'reason-cell', title: row.reason || '' }, row.reason || '—'),
        },
        {
          key: 'status',
          label: '状态',
          width: '86px',
          render: (row) => {
            const s = REQ_STATUS[row.status] || { label: row.status, kind: 'muted' };
            return el('div', { class: 'mode-cell' },
              ui.badge(s.label, s.kind),
              row.status !== 'pending_approval' && row.reviewNote ? el('span', { class: 'cell-sub tiny muted', title: row.reviewNote }, row.reviewNote) : null,
            );
          },
        },
        {
          key: 'op',
          label: '操作',
          width: '150px',
          render: (row) => {
            if (row.status !== 'pending_approval') return el('span', { class: 'tiny muted' }, '已处理');
            if (!row.canReview) {
              return el('span', { class: 'tiny muted', title: '不能审批本人提交的变更' }, row.requestedBy === (ctx.user && ctx.user.id) ? '本人申请' : '无权限');
            }
            return el('div', { class: 'row wrap op-cell' },
              el('button', {
                class: 'btn primary sm', type: 'button',
                onclick: (ev) => { ev.stopPropagation(); reviewRequest(row, 'approve'); },
              }, '通过'),
              el('button', {
                class: 'btn ghost sm', type: 'button',
                onclick: (ev) => { ev.stopPropagation(); reviewRequest(row, 'reject'); },
              }, '驳回'),
            );
          },
        },
      ],
      rows: state.requests,
      emptyText: '暂无参数变更申请',
    }));
  }

  function reviewRequest(row, action) {
    const isApprove = action === 'approve';
    const note = ui.textarea({
      rows: 3,
      maxlength: 300,
      placeholder: isApprove ? '可填写审批意见（默认「同意调整」）' : '必填：说明驳回原因',
    });
    const errBox = el('div', { class: 'error-text', hidden: true });
    const cancelBtn = el('button', { class: 'btn', type: 'button' }, '取消');
    const submitBtn = el('button', { class: `btn ${isApprove ? 'primary' : 'danger'}`, type: 'button' }, isApprove ? '确认通过' : '确认驳回');

    const body = el('div', { class: 'stack tight' },
      ui.kv([
        ['参数', `${row.paramName || row.paramKey}（${row.paramKey}）`],
        ['当前值 → 申请值', `${fmt.auto(row.currentValue)} → ${fmt.auto(row.value)} ${row.unit || ''}`],
        ['申请人', `${row.requestedByName || '—'} · ${fmt.dateTime(row.createdAt)}`],
        ['申请理由', row.reason || '—'],
      ]),
      isApprove
        ? ui.notice('通过后将立即写入该参数并生成新版本，同时通知申请人。', '')
        : ui.notice('驳回后不写入参数，申请人会收到驳回原因。', 'warn'),
      ui.field(isApprove ? '审批意见（可选）' : '驳回原因（必填）', note, '写入审批记录并通知申请人。'),
      errBox,
    );

    const modal = ui.modal({
      title: isApprove ? `通过变更申请：${row.paramName}` : `驳回变更申请：${row.paramName}`,
      sub: `${row.id || ''}${row.siteName ? ` · ${row.siteName}` : ''}`,
      body,
      footer: el('div', { class: 'row', style: { width: '100%' } }, el('span', { class: 'spacer' }), cancelBtn, submitBtn),
    });
    cancelBtn.addEventListener('click', () => modal.close());
    note.focus();

    submitBtn.addEventListener('click', async () => {
      const text = note.value.trim();
      if (!isApprove && !text) {
        errBox.hidden = false;
        errBox.textContent = '请填写驳回原因';
        note.focus();
        return;
      }
      const ok = await ctx.confirm({
        title: isApprove ? '确认通过审批' : '确认驳回申请',
        message: isApprove
          ? `通过后「${row.paramName}」将调整为 ${fmt.auto(row.value)}${row.unit || ''}，确认？`
          : `确认驳回「${row.paramName}」的变更申请？`,
        detail: `申请编号：${row.id}\n申请人：${row.requestedByName || '—'}\n申请值：${fmt.auto(row.value)}${row.unit || ''}${text ? `\n意见：${text}` : ''}`,
        confirmText: isApprove ? '确认通过' : '确认驳回',
        danger: !isApprove,
      });
      if (!ok) return;
      state.busy = true;
      submitBtn.disabled = true;
      cancelBtn.disabled = true;
      try {
        await ctx.api.post(`/api/param-requests/${encodeURIComponent(row.id)}/${action}`, { note: text });
        modal.close();
        ui.toast(isApprove ? '已通过，参数已更新' : '已驳回并通知申请人', 'success');
        await Promise.all([loadRequests(), loadParams()]);
      } catch (err) {
        errBox.hidden = false;
        errBox.textContent = err && err.message ? err.message : '操作失败，请稍后重试';
      } finally {
        state.busy = false;
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });
  }

  /* ---------- 刷新与实时 ---------- */
  async function refreshAll(manual) {
    await Promise.all([loadParams(), loadRequests()]);
    if (manual) ui.toast('已刷新参数', 'success');
  }

  refreshBtn.addEventListener('click', () => refreshAll(true));

  renderLegend();
  renderStats();
  renderTabs();
  renderBody();
  await refreshAll(false);
  renderTabs();
  renderUpdated();

  const live = ui.debounce(() => { refreshAll(false).catch(() => {}); }, 600);
  ctx.subscribe((evt) => {
    if (!evt) return;
    if (evt.type === 'param') live();
  });

  ctx.every(30000, () => {
    loadParams().catch(() => {});
    loadRequests().catch(() => {});
  });
}
