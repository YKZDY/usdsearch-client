/**
 * dateFormat - 日期范围紧凑显示与天数计算
 *
 * - formatRangeShort(after, before, toNowLabel): 同年省略年份；before 空 = "至今"
 *   eg. ('2026-05-07', '', '至今')          -> '5/7 ~ 至今'
 *       ('2026-05-07', '2026-05-12', '至今') -> '5/7 ~ 5/12'
 *       ('2025-12-01', '2026-01-15', '至今') -> '2025/12/1 ~ 2026/1/15'
 *
 * - calcDays(after, before): 返回 [after, before||today] 闭区间天数（含两端）
 *   仅 after 为空时返回 0；非法日期返回 0
 */

/** 解析 'YYYY-MM-DD' 字符串为本地 Date（避免 UTC 时区偏差导致差一天） */
function parseLocalDate(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

/**
 * 紧凑格式化日期范围
 * @param {string} after  起始日期 'YYYY-MM-DD'
 * @param {string} before 结束日期 'YYYY-MM-DD'，为空表示"至今"
 * @param {string} toNowLabel 国际化的"至今"文案
 * @returns {string}
 */
export function formatRangeShort(after, before, toNowLabel = '至今') {
  const da = parseLocalDate(after);
  const db = parseLocalDate(before);

  // 都空：无效，调用方一般不会传
  if (!da && !db) return '';

  const fmtFull = (d) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  const fmtShort = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

  // 仅有 before（之前的资产）：'～ 2026/5/7'
  if (!da && db) return `~ ${fmtFull(db)}`;

  // 仅有 after：'5/7 ~ 至今'（同年省略）/ '2025/12/1 ~ 至今'
  const thisYear = new Date().getFullYear();
  if (da && !db) {
    return `${da.getFullYear() === thisYear ? fmtShort(da) : fmtFull(da)} ~ ${toNowLabel}`;
  }

  // 两端都有：同年省略年份
  if (da.getFullYear() === db.getFullYear()) {
    if (da.getFullYear() === thisYear) {
      return `${fmtShort(da)} ~ ${fmtShort(db)}`;
    }
    return `${fmtFull(da)} ~ ${fmtShort(db)}`;
  }
  return `${fmtFull(da)} ~ ${fmtFull(db)}`;
}

/**
 * 计算日期范围的天数（含两端）
 * @param {string} after  起始日期
 * @param {string} before 结束日期；为空使用今天
 * @returns {number}
 */
export function calcDays(after, before) {
  const da = parseLocalDate(after);
  if (!da) return 0;
  const db = parseLocalDate(before) || new Date();
  // 把时间归零，避免夏令时/小时差
  const a = new Date(da.getFullYear(), da.getMonth(), da.getDate()).getTime();
  const b = new Date(db.getFullYear(), db.getMonth(), db.getDate()).getTime();
  if (b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}
