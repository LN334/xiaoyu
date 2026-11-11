#!/usr/bin/env node
/**
 * 线性布局的尺寸核对（不需要设备/模拟器）：
 * 找出「加了子 View，但在父容器方向上尺寸为 0」的调用——这类子 View 在真机上量出 0 宽或 0 高，
 * 整块内容看不见，而代码能编译、页面也能打开，只留下「点进去是空白页」。
 *
 * 规则（LinearLayout 的行为，不是约定）：
 *   - 竖向容器里，子 View 的 width 写成 0 就是 0 宽，layout_weight 只分配高度，救不回来；
 *   - 横向容器里，子 View 的 height 写成 0 就是 0 高；
 *   - 横向容器里 width 写成 0，必须给 layout_weight > 0 才会分到宽度。
 *
 * 用法：
 *   node test/layout-check.js            核对 src 下所有 Java 文件
 *   node test/layout-check.js --selftest 先自检本脚本的鉴别力（正反样例各 3 条）
 * 输出 "LAYOUT-CHECK pass=N fail=N"，有失败退出码 1。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'com', 'ln334', 'zhifuwater');

/* ---------------- 文本工具：去注释、切参数 ---------------- */

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}

/** 从 open 处的 '(' 起，返回与之配对的 ')' 的下标；找不到返回 -1。 */
function matchParen(src, open) {
  let depth = 0;
  let inStr = false;
  let inChar = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (inChar) {
      if (c === '\\') i++;
      else if (c === "'") inChar = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "'") { inChar = true; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** 按顶层逗号切参数，忽略嵌套括号/字符串里的逗号。 */
function splitArgs(text) {
  const out = [];
  let depth = 0;
  let inStr = false;
  let inChar = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (inChar) {
      if (c === '\\') i++;
      else if (c === "'") inChar = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "'") { inChar = true; continue; }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
  }
  const tail = text.slice(start).trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

/** 解析 U.lp(...) / U.lpWith(...) 参数，返回 { w, h, weight }（数字或 null=非字面量）。 */
function parseLp(expr) {
  const s = expr.trim();
  const m = /^U\.(lp|lpWith)\s*\(/.exec(s);
  if (!m) return null;
  const open = s.indexOf('(', m.index);
  const close = matchParen(s, open);
  if (close < 0) return null;
  const args = splitArgs(s.slice(open + 1, close));
  const num = (v) => {
    if (v === undefined) return null;
    const t = v.trim();
    if (/^0+[fFdD]?$/.test(t)) return 0;
    if (/^[1-9]\d*[fFdD]?$/.test(t)) return Number(t.replace(/[fFdD]$/, ''));
    return null; // U.MATCH / U.WRAP / U.dp(...) 等都是非零，视为不限
  };
  // weight：缺失或字面量 0 才算没有权重；正数、小数、表达式（如 Math.max(...)）都按「有权重」处理。
  const weightOf = (v) => {
    if (v === undefined) return 0;
    const t = v.trim();
    if (/^0+[fFdD]?$/.test(t)) return 0;
    return 1;
  };
  if (m[1] === 'lp') {
    return { w: num(args[0]), h: num(args[1]), weight: weightOf(args[2]) };
  }
  // lpWith(ctx, w, h, l, t, r, b)
  return { w: num(args[1]), h: num(args[2]), weight: 0 };
}

/* ---------------- 扫描 ---------------- */

function scan(src, label) {
  const problems = [];
  const text = stripComments(src);

  // 变量 -> 方向。覆盖 U.linear(x, VERTICAL) / new LinearLayout(x) + setOrientation 两种写法。
  const dirs = new Map();
  const linRe = /(\w+)\s*=\s*U\.linear\s*\(\s*[^,]+,\s*(?:LinearLayout\.)?(VERTICAL|HORIZONTAL)\s*\)/g;
  let m;
  while ((m = linRe.exec(text)) !== null) dirs.set(m[1], m[2]);
  const newRe = /(\w+)\s*=\s*new\s+LinearLayout\s*\([^)]*\)\s*;/g;
  while ((m = newRe.exec(text)) !== null) dirs.set(m[1], 'UNKNOWN');
  const orientRe = /(\w+)\.setOrientation\s*\(\s*(?:LinearLayout\.)?(VERTICAL|HORIZONTAL)\s*\)/g;
  while ((m = orientRe.exec(text)) !== null) {
    if (dirs.has(m[1]) && dirs.get(m[1]) === 'UNKNOWN') dirs.set(m[1], m[2]);
  }

  const addRe = /(\w+)\.addView\s*\(/g;
  while ((m = addRe.exec(text)) !== null) {
    const parent = m[1];
    const dir = dirs.get(parent);
    if (dir !== 'VERTICAL' && dir !== 'HORIZONTAL') continue;
    const open = text.indexOf('(', m.index);
    const close = matchParen(text, open);
    if (close < 0) continue;
    const args = splitArgs(text.slice(open + 1, close));
    if (args.length < 2) continue;
    const lp = parseLp(args[1]);
    if (!lp) continue;
    const line = text.slice(0, m.index).split('\n').length;
    const where = label + ':' + line + ' (' + parent + ' ' + dir.toLowerCase() + ')';
    if (dir === 'VERTICAL' && lp.w === 0) {
      problems.push(where + ' 宽 0：竖向容器里宽度不会因 layout_weight 变宽，子 View 量成 0 宽');
    }
    if (dir === 'HORIZONTAL' && lp.h === 0) {
      problems.push(where + ' 高 0：横向容器里高度不会因 layout_weight 变高，子 View 量成 0 高');
    }
    if (dir === 'HORIZONTAL' && lp.w === 0 && !(lp.weight > 0)) {
      problems.push(where + ' 宽 0 且无 layout_weight：横向容器里的子 View 量成 0 宽');
    }
  }
  return problems;
}

/* ---------------- 自检：脚本自己得有鉴别力 ---------------- */

function selftest() {
  const cases = [
    { name: '竖向容器宽度 0（本次空白页的形态）', src: 'void f(){ LinearLayout root = U.linear(this, LinearLayout.VERTICAL); ScrollView s = new ScrollView(this); root.addView(s, U.lp(0, 0, 1f)); }', want: 1 },
    { name: '横向容器宽度 0 无权重（标题不显示）', src: 'void f(){ LinearLayout bar = U.linear(this, LinearLayout.HORIZONTAL); bar.addView(U.tv(this, "t", 17, 0, true), U.lpWith(this, 0, U.WRAP, 6, 0, 0, 0)); }', want: 1 },
    { name: '横向容器高度 0（按钮看不见）', src: 'void f(){ LinearLayout row = U.linear(this, LinearLayout.HORIZONTAL); row.addView(b, U.lp(U.MATCH, 0)); }', want: 1 },
    { name: '竖向容器里 0 高 + 权重（合法，占满剩余高度）', src: 'void f(){ LinearLayout root = U.linear(this, LinearLayout.VERTICAL); root.addView(s, U.lp(U.MATCH, 0, 1f)); }', want: 0 },
    { name: '横向容器里 0 宽 + 权重（合法，分到宽度）', src: 'void f(){ LinearLayout row = U.linear(this, LinearLayout.HORIZONTAL); row.addView(v, U.lp(0, U.WRAP, 1f)); }', want: 0 },
    { name: '完整宽度 + 换行高度（合法）', src: 'void f(){ LinearLayout root = U.linear(this, LinearLayout.VERTICAL); root.addView(v, U.lp(U.MATCH, U.WRAP)); }', want: 0 },
  ];
  let pass = 0;
  let fail = 0;
  cases.forEach((c) => {
    const got = scan(c.src, 'case').length;
    if (got === c.want) {
      pass++;
      console.log('  ok   ' + c.name + ' => ' + got + ' 条');
    } else {
      fail++;
      console.log('  FAIL ' + c.name + ' => 期望 ' + c.want + ' 条，实际 ' + got + ' 条');
    }
  });
  console.log('LAYOUT-CHECK-SELFTEST pass=' + pass + ' fail=' + fail);
  return fail === 0 ? 0 : 1;
}

/* ---------------- 主流程 ---------------- */

if (process.argv.includes('--selftest')) {
  process.exit(selftest());
}

let pass = 0;
let fail = 0;
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.java')).sort();
files.forEach((f) => {
  const problems = scan(fs.readFileSync(path.join(SRC, f), 'utf8'), f);
  if (problems.length === 0) {
    pass++;
    console.log('  ok   ' + f);
  } else {
    fail++;
    console.log('  FAIL ' + f);
    problems.forEach((p) => console.log('       ' + p));
  }
});
console.log('LAYOUT-CHECK pass=' + pass + ' fail=' + fail + '（文件数 ' + files.length + '）');
process.exit(fail === 0 ? 0 : 1);
