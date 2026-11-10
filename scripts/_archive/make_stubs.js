'use strict';
/* 生成页面占位模块与页面样式文件（被团队页面实现覆盖后即可忽略） */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGES = path.join(ROOT, 'web/js/pages');
const CSS = path.join(ROOT, 'web/css');
fs.mkdirSync(PAGES, { recursive: true });
fs.mkdirSync(CSS, { recursive: true });

const defs = [
  ['dashboard', '综合驾驶舱', 'dash'],
  ['process', '工艺监控', 'dash'],
  ['monitor', '实时监测', 'dash'],
  ['alarms', '告警中心', 'control'],
  ['control', '远程控制', 'control'],
  ['params', '工艺参数', 'control'],
  ['quality', '水质与化验', 'data'],
  ['diagnosis', '智能诊断', 'data'],
  ['analysis', '数据分析', 'data'],
  ['reports', '报表中心', 'data'],
  ['workorders', '工单管理', 'ops'],
  ['inspections', '巡检管理', 'ops'],
  ['devices', '设备台账', 'ops'],
  ['admin', '系统管理', 'ops'],
  ['mobile', '手机端视图', 'ops'],
];

for (const [id, title] of defs) {
  const file = path.join(PAGES, `${id}.js`);
  if (fs.existsSync(file)) continue;
  fs.writeFileSync(file, `import * as ui from '../ui.js';

export const meta = { title: '${title}' };

export async function render(root, ctx) {
  ui.mount(root,
    ui.pageHead('${title}', '页面骨架已就绪，内容由页面实现补齐。'),
    ui.card({
      body: ui.empty('页面即将呈现', '此处将展示「${title}」的完整功能。', 'monitor'),
    }),
  );
}
`, 'utf8');
}

const cssFiles = {
  'pages-dash.css': '/* 总览类页面：驾驶舱 / 工艺监控 / 实时监测 */\n',
  'pages-control.css': '/* 运行类页面：告警中心 / 远程控制 / 工艺参数 */\n',
  'pages-data.css': '/* 水质与诊断类页面：水质化验 / 智能诊断 / 数据分析 / 报表 */\n',
  'pages-ops.css': '/* 运维与系统类页面：工单 / 巡检 / 设备 / 系统管理 / 手机端 */\n',
};
for (const [name, header] of Object.entries(cssFiles)) {
  const file = path.join(CSS, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, header, 'utf8');
}

console.log('stubs ok:', defs.length, 'pages');
