/* 多站总览：按当前账号可见范围汇总现有站点状态、告警和工单 */
import * as ui from '../ui.js';

export const meta = { title: '多站总览' };

const STATUS = {
  online: ['有新数据', 'good'],
  stale: ['数据超时', 'warn'],
  unknown: ['暂无数据', 'muted'],
};

export async function render(root, ctx) {
  root.classList.add('p-fleet');
  ctx.setTitle(meta.title);

  let sites = [];
  let filter = 'all';
  let query = '';
  const page = ui.el('div', { class: 'fleet-page' });
  const list = ui.el('div', { class: 'fleet-grid' });
  const kpis = ui.el('div', { class: 'fleet-kpis' });
  const search = ui.el('input', {
    class: 'input fleet-search', type: 'search', placeholder: '搜索站点名称或区域',
    'aria-label': '搜索站点名称或区域', oninput: (event) => { query = event.target.value.trim().toLowerCase(); renderSites(); },
  });
  const statusSelect = ui.el('select', {
    class: 'select fleet-status', 'aria-label': '按数据状态筛选',
    onchange: (event) => { filter = event.target.value; renderSites(); },
  },
  ui.el('option', { value: 'all' }, '全部状态'),
  ui.el('option', { value: 'online' }, '有新数据'),
  ui.el('option', { value: 'stale' }, '数据超时'),
  ui.el('option', { value: 'unknown' }, '暂无数据'));

  const refresh = ui.el('button', {
    class: 'btn ghost', type: 'button', onclick: () => load(),
  }, ui.icon('refresh'), '刷新');
  const toolbar = ui.el('div', { class: 'fleet-toolbar' }, search, statusSelect, refresh);
  const sourceNote = ui.el('p', { class: 'fleet-source' });
  ui.mount(root,
    ui.pageHead('多站总览', '集中查看授权范围内各站点的数据接入、告警和运维待办。'),
    page,
  );
  page.append(kpis, ui.card({ title: '站点状态', sub: '点击站点进入现有单站驾驶舱', actions: toolbar, body: list }), sourceNote);

  async function load() {
    ui.mount(list, ui.skeleton(3, 'block'));
    try {
      sites = await ctx.api.get('/api/sites') || [];
      drawSummary();
      renderSites();
      sourceNote.textContent = ctx.settings?.simulationEnabled
        ? '当前为演示环境：页面数据来自模拟引擎，仅用于功能演示，不代表现场实测。'
        : '模拟引擎已关闭；站点状态依据已配置网关的最新上报时间计算。各点位来源与质量请在站点详情中核对。';
    } catch (error) {
      ui.mount(list, ui.errorState(error, load));
    }
  }

  function drawSummary() {
    const online = sites.filter((site) => site.connectionStatus === 'online').length;
    const stale = sites.filter((site) => site.connectionStatus === 'stale').length;
    const alarmCount = sites.reduce((sum, site) => sum + (site.counts?.activeAlarms || 0), 0);
    const criticalCount = sites.reduce((sum, site) => sum + (site.counts?.criticalAlarms || 0), 0);
    const workorders = sites.reduce((sum, site) => sum + (site.counts?.openWorkorders || 0), 0);
    const pointCount = sites.reduce((sum, site) => sum + (site.counts?.points || 0), 0);
    const onlinePoints = sites.reduce((sum, site) => sum + (site.counts?.onlinePoints || 0), 0);
    const coverage = pointCount ? Math.round(onlinePoints / pointCount * 100) : null;
    ui.mount(kpis,
      ui.kpi({ label: '纳管站点', value: sites.length, unit: '座', tone: 'blue' }),
      ui.kpi({ label: '90 秒内有数据', value: online, unit: '座', tone: 'good' }),
      ui.kpi({ label: '数据超时', value: stale, unit: '座', tone: stale ? 'warn' : '' }),
      ui.kpi({ label: '未关闭告警', value: alarmCount, delta: criticalCount ? `其中紧急 ${criticalCount} 条` : '当前授权站点范围', tone: criticalCount ? 'bad' : '' }),
      ui.kpi({ label: '待处理工单', value: workorders, unit: '张' }),
      ui.kpi({ label: '点位在线率', value: coverage == null ? '—' : coverage, unit: coverage == null ? '' : '%', hint: '按最近 90 秒内有数据的点位计算' }),
    );
  }

  function renderSites() {
    const visible = sites.filter((site) => {
      const status = site.connectionStatus || 'unknown';
      if (filter !== 'all' && status !== filter) return false;
      const haystack = `${site.name || ''} ${site.shortName || ''} ${site.region || ''} ${site.area || ''}`.toLowerCase();
      return !query || haystack.includes(query);
    });
    if (!visible.length) {
      ui.mount(list, ui.empty(sites.length ? '没有符合条件的站点' : '当前账号暂无授权站点', sites.length ? '调整搜索词或状态筛选。' : '请联系平台管理员配置站点范围。', 'dashboard'));
      return;
    }
    ui.mount(list, visible.map(siteCard));
  }

  function siteCard(site) {
    const [statusName, tone] = STATUS[site.connectionStatus] || STATUS.unknown;
    const counts = site.counts || {};
    const alarmTone = counts.criticalAlarms ? 'bad' : counts.activeAlarms ? 'warn' : 'good';
    return ui.el('button', {
      class: `fleet-site status-${site.connectionStatus || 'unknown'}`, type: 'button',
      onclick: () => ctx.selectSite(site.id),
      'aria-label': `查看${site.name || site.id}单站详情`,
    },
      ui.el('div', { class: 'fleet-site-top' },
        ui.el('div', {},
          ui.el('strong', { class: 'fleet-site-name' }, site.name || site.id),
          ui.el('div', { class: 'fleet-site-region' }, [site.region, site.area].filter(Boolean).join(' · ') || '区域未登记'),
        ),
        ui.badge(statusName, tone),
      ),
      ui.el('div', { class: 'fleet-site-metrics' },
        metric('点位在线', `${counts.onlinePoints || 0} / ${counts.points || 0}`),
        metric('未关闭告警', counts.activeAlarms || 0, alarmTone),
        metric('待处理工单', counts.openWorkorders || 0),
      ),
      ui.el('div', { class: 'fleet-site-foot' },
        ui.el('span', {}, `设备 ${counts.onlineDevices || 0} / ${counts.installed || 0} 通讯正常`),
        ui.el('span', {}, site.lastDataAt ? `最近数据 ${ui.fmt.ago(site.lastDataAt)}` : '尚无点位数据'),
      ),
    );
  }

  function metric(label, value, tone = '') {
    return ui.el('div', { class: 'fleet-metric' },
      ui.el('span', {}, label),
      ui.el('b', { class: tone ? `text-${tone}` : '' }, value),
    );
  }

  await load();
  ctx.every(30000, load);
}
