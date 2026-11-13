'use strict';
/**
 * JSON 文件存储。面向演示环境：单进程、原子写、定时落盘。
 * 结构：data/db.json 保存业务实体；演示遥测历史在内存中重建，现场网关历史由 Telemetry 单独写入 JSONL。
 */
const fs = require('fs');
const path = require('path');

class Store {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = path.join(dataDir, 'db.json');
    this.data = null;
    this._timer = null;
    this._dirty = false;
  }

  load(seedFn, { reset = false } = {}) {
    fs.mkdirSync(this.dir, { recursive: true });
    let loaded = null;
    if (!reset && fs.existsSync(this.file)) {
      try {
        loaded = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      } catch (e) {
        console.warn('[store] db.json 解析失败，将重新生成种子数据：', e.message);
      }
    }
    if (loaded && loaded.meta && loaded.meta.version >= 1) {
      this.data = loaded;
      this.migrate();
    } else {
      this.data = seedFn();
      this.save(true);
    }
    return this.data;
  }

  /** 结构升级钩子（预留） */
  migrate() {
    const d = this.data;
    d.meta = d.meta || {};
    d._seq = d._seq || {};
    for (const k of ['alarm', 'wo', 'cmd', 'diag', 'audit', 'lab', 'insp', 'paramv', 'notif', 'alarmRule']) {
      if (!d._seq[k]) d._seq[k] = 1;
    }
  }

  nextId(kind, prefix) {
    const n = this.data._seq[kind] || 1;
    this.data._seq[kind] = n + 1;
    this.saveSoon();
    return `${prefix}${String(n).padStart(5, '0')}`;
  }

  saveSoon() {
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this._dirty) this.save();
    }, 400);
  }

  save(force = false) {
    if (!this.data) return;
    this._dirty = false;
    const tmp = this.file + '.tmp';
    const text = JSON.stringify(this.data);
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, this.file);
    if (force) this.lastSavedAt = Date.now();
  }

  stop() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    this.save(true);
  }
}

module.exports = { Store };
