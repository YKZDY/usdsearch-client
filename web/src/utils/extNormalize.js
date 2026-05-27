/**
 * 扩展名归一化工具 — 集中处理"前端表示 vs 后端契约"的差异。
 *
 * 背景：
 *   - 前端 UI（FormatFilter.jsx）chip 显示用带前导点形式（".usd" / ".png"），便于阅读
 *   - 后端 ext 索引存的是不带点的小写值（"usd" / "png"），按字面比较
 *   - 两边混用会导致筛选返回 0 hit（参考 R4 修复，2026-05-26）
 *
 * 约定：
 *   - normalizeExtForUI(x)         → 带点小写（".usd"），UI 显示用
 *   - normalizeExtForBackend(x)    → 不带点小写（"usd"），请求体用
 *   - parseExtListForUI(s)         → 拆逗号 + 归一化为 UI 形式 + 去重
 *   - normalizeExtListForBackend(s)→ 拆逗号 + 归一化为后端形式 + 去重
 *
 * 设计：
 *   - 接受 string，宽容容错（null/undefined/空字符串都返回空值/空数组）
 *   - 大小写统一为小写
 *   - 自动 trim
 *   - 数组去重（保持首次出现顺序）
 */

/** 单个扩展名 → UI 形式（带前导点小写） */
export function normalizeExtForUI(ext) {
  if (!ext) return '';
  const trimmed = String(ext).trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

/** 单个扩展名 → 后端形式（不带点小写） */
export function normalizeExtForBackend(ext) {
  if (!ext) return '';
  return String(ext).trim().toLowerCase().replace(/^\./, '');
}

/** 拆逗号字符串 → UI 形式扩展名数组（去重保序） */
export function parseExtListForUI(str) {
  const seen = new Set();
  const out = [];
  String(str || '').split(',').forEach(s => {
    const n = normalizeExtForUI(s);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  });
  return out;
}

/** 拆逗号字符串 → 后端形式扩展名数组（去重保序） */
export function normalizeExtListForBackend(str) {
  const seen = new Set();
  const out = [];
  String(str || '').split(',').forEach(s => {
    const n = normalizeExtForBackend(s);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  });
  return out;
}
