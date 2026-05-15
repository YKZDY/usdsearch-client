/**
 * SPDX-FileCopyrightText: Copyright (c) 2024-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

// If not set it uses the local 'api/' endpoint
export const apiUrl = process.env.REACT_APP_API_URL || "";

export const defaultEmbeddingFieldName = process.env.REACT_APP_DEFAULT_EMBEDDING_FIELD_NAME || "siglip2-embedding.embedding";
export const defaultEmbeddingDimension = process.env.REACT_APP_DEFAULT_EMBEDDING_DIMENSION || 1536;

// Default embedding configuration
export const defaultEmbeddingConfig = {
  field_name: defaultEmbeddingFieldName,
  dimension: 1536
};

// Server name to URL mapping configuration
// Expects a JSON string in format: {"server1": {"name":"...","apiUrl":"","host":"..."}, ...}
//
// [Tag Deploy Fix - 防线 3]
// 内置兜底映射：即使部署环境忘配 REACT_APP_SERVER_MAPPING，常用别名也能解析为真实 host。
// env 配置优先级最高，会覆盖兜底；这层只在 env 缺/坏时生效。
// 历史踩坑：部署环境 SERVER_MAPPING 为 {} → selectedBackend="omniverse" 直接被当作 host
//           拼成 wss://omniverse/... → 浏览器无法解析 → tag 增删全部静默失败。
//
// v2 别名升级（保持向后兼容）：
//   - 'nucleus'                 ← 新主 key，URL 默认形态 ?server=nucleus
//   - 'omniverse'               ← 老链接兼容入口（旧书签仍可用）
//   - 'omniverse://ov.qq.com'   ← 兼容生产 env 既有形态（保留以免老登录用户掉线）
// 三个 key 共享同一 NUCLEUS_CONFIG 引用，渲染时按引用去重只显示一行。
// host 字段提供给 resolveNucleusHost 优先读取，链路更短更可靠。
const NUCLEUS_CONFIG = { name: "OV.QQ.COM", apiUrl: "", host: "ov.qq.com" };
const SERVER_MAPPING_FALLBACK = {
  nucleus: NUCLEUS_CONFIG,
  omniverse: NUCLEUS_CONFIG,
  "omniverse://ov.qq.com": NUCLEUS_CONFIG,
};

let serverMapping = {};
try {
  const mappingStr = process.env.REACT_APP_SERVER_MAPPING || "{}";
  const parsed = JSON.parse(mappingStr);
  // env 优先，兜底补缺：fallback 先，env 后展开，env 同 key 自动覆盖
  serverMapping = { ...SERVER_MAPPING_FALLBACK, ...parsed };
} catch (error) {
  console.error("Failed to parse SERVER_MAPPING configuration:", error);
  serverMapping = { ...SERVER_MAPPING_FALLBACK };
}
export const SERVER_MAPPING = serverMapping;

/**
 * 取默认 server key —— 多组件共用，避免出现 HeaderIcons 选 nucleus、HybridDeepSearchUI 选 omniverse 的撕裂状态。
 * 优先级：nucleus（v2 主别名） → omniverse（兼容） → Object.keys()[0]（兜底，env 顺序不稳但好过空）
 */
export function getDefaultServerKey() {
  if (Object.prototype.hasOwnProperty.call(serverMapping, 'nucleus')) return 'nucleus';
  if (Object.prototype.hasOwnProperty.call(serverMapping, 'omniverse')) return 'omniverse';
  const keys = Object.keys(serverMapping);
  return keys.length > 0 ? keys[0] : '';
}

/**
 * [Tag Deploy Fix - 防线 3] 把任意 server 标识规范化为合法 nucleus host
 *
 * 输入示例 → 输出：
 *   "omniverse://ov.qq.com"  → "ov.qq.com"
 *   "omniverse://ov.qq.com/" → "ov.qq.com"
 *   "https://ov.qq.com"      → "ov.qq.com"
 *   "ov.qq.com"              → "ov.qq.com"
 *   "omniverse"              → 查 SERVER_MAPPING['omniverse'] 递归解析 → "ov.qq.com"
 *   "nucleus"                → 同上 → "ov.qq.com"
 *   ""/null/undefined        → ""
 *
 * 注意：本函数只做字符串规范化，不做合法性判断（合法性校验交给
 *      services/taggingService.js 的 isValidNucleusHost，避免循环依赖）。
 */
export function resolveNucleusHost(input) {
  if (!input || typeof input !== 'string') return '';
  let s = input.trim();
  if (!s) return '';

  // 1) 别名查表（防止 "omniverse" 这种裸 key 直接当 host）
  //    优先读富对象的 host 字段；否则递归一次（mapping 的 value 也可能是 omniverse:// URL string）
  if (Object.prototype.hasOwnProperty.call(serverMapping, s)) {
    const mapped = serverMapping[s];
    if (mapped) {
      // v2 富对象形态：{ name, apiUrl, host }
      if (typeof mapped === 'object' && typeof mapped.host === 'string' && mapped.host.trim()) {
        return mapped.host.trim();
      }
      // 兼容旧 string 形态
      if (typeof mapped === 'string' && mapped !== s) {
        s = mapped;
      }
    }
  }

  // 2) 剥协议头：omniverse:// / omni:// / https:// / http:// / wss:// / ws://
  s = s.replace(/^(omniverse|omni|wss|ws|https|http):\/\//i, '');

  // 3) 去掉路径 / query / 末尾斜杠
  const slashIdx = s.indexOf('/');
  if (slashIdx > 0) s = s.substring(0, slashIdx);
  const qIdx = s.indexOf('?');
  if (qIdx > 0) s = s.substring(0, qIdx);
  s = s.replace(/\/$/, '').trim();

  return s;
}

// Image processing configuration
export const IMAGE_SIZE = 224;

// Duplicate removal configuration
export const DUPLICATE_REMOVAL_THRESHOLD = process.env.REACT_APP_DUPLICATE_REMOVAL_THRESHOLD || 0.0001;

// Check if running on HTTPS (required for clipboard API)
export const IS_HTTPS = typeof window !== 'undefined' && window.location.protocol === 'https:';

// Feature flags configuration
export const FEATURE_FLAGS = {
  // Enable/disable feedback modal - enabled by default, can be disabled via env var
  ENABLE_FEEDBACK_MODAL: process.env.REACT_APP_ENABLE_FEEDBACK_MODAL === "true",
  // 新卡片交互模式：单击=查看详情，hover checkbox=多选
  // 设为 false 可回退到旧版（整卡片点击=选中）
  NEW_CARD_INTERACTION: true,
  // V2 批量打标签入口开关（临时隐藏，演示就绪后再开）
  // 设 true 恢复显示 SelectionModeBar 的"批量打标签"按钮
  BATCH_TAGGING: false,
  // === LM CUSTOMIZATION: SingleClickDrawerFlag START ===
  // Group A 选择交互重构（方案 B：完整对齐 Windows 资源管理器复选框模式）
  // true（默认）：
  //   - 单击卡片本体 → 打开右侧详情 Drawer，不动选中
  //   - 单击复选框 → toggle 该项 + 设 anchor
  //   - Shift + 复选框 → 追加 anchor→target 区间到选中
  //   - Shift + 本体    → 仅保留 anchor→target 区间（覆盖式）
  //   - Ctrl/Cmd + 任意 → toggle 该项 + 设新 anchor
  //   - 修饰键路径一律不打开 Drawer
  // false：
  //   - 完整退回到旧版交互（单击=单选覆盖、双击=打开 Modal）
  //   - 用于线上紧急回滚，无需 revert 代码
  // 详见：.codebuddy/plan/group-a-selection-and-detail/SELECTION-SPEC.md
  // 合入英伟达新版时：保留本旗标，与 NEW_CARD_INTERACTION 共存。
  SINGLE_CLICK_DRAWER: true,
  // === LM CUSTOMIZATION: SingleClickDrawerFlag END ===
};

// Authentication configuration
export const AUTH_CONFIG = {
  // Enable/disable authentication methods - show Basic Auth by default, others opt-in
  ENABLE_NUCLEUS_AUTH: process.env.REACT_APP_ENABLE_NUCLEUS_AUTH === "true",
  ENABLE_API_KEY_AUTH: process.env.REACT_APP_ENABLE_API_KEY_AUTH === "true",
  ENABLE_BASIC_AUTH: process.env.REACT_APP_ENABLE_BASIC_AUTH !== "false",
  
  // Default values if provided
  DEFAULT_NUCLEUS_TOKEN: process.env.REACT_APP_DEFAULT_NUCLEUS_TOKEN || "",
  DEFAULT_API_KEY: process.env.REACT_APP_DEFAULT_API_KEY || "",
  DEFAULT_USERNAME: process.env.REACT_APP_DEFAULT_USERNAME || "",
  DEFAULT_PASSWORD: process.env.REACT_APP_DEFAULT_PASSWORD || "",
};

// ============================================================
// Unified Search UI Defaults
// Change these values in ONE place to update defaults everywhere.
// ============================================================
export const SEARCH_DEFAULTS = {
  // View / display settings
  viewMode: "grid",            // "list" or "grid"
  gridSize: "L",               // "L" (large) or "S" (small/compact)
  showScores: false,           // whether to show relevance scores
  showOnlyWithPreviews: true,  // only show results that have preview thumbnails
  filtersCollapsed: true,      // whether the filter panel starts collapsed
  configCollapsed: true,       // whether the config panel starts collapsed
};

// Default search filter parameters
export const DEFAULT_SEARCH_PARAMS = {
  // File & Name Filters (Most Common)
  file_name: "",
  exclude_file_name: "",
  file_extension_include: "",
  file_extension_exclude: "usd,usda,usdc,usdz,jpg,png",

  // Path & Location Filters
  search_path: "",
  exclude_search_path: "",
  search_in_scene: "",
  filter_url_regexp: "",

  // Content & Properties Filters
  filter_by_properties: "",
  filter_by_tags: "",
  vision_metadata: "",

  // Size & Dimension Filters
  file_size_greater_than: "",
  file_size_less_than: "",
  min_bbox_x: "",
  min_bbox_y: "",
  min_bbox_z: "",
  max_bbox_x: "",
  max_bbox_y: "",
  max_bbox_z: "",
  bbox_use_scaled_dimensions: true,

  // Date Filters
  created_after: "",
  created_before: "",
  modified_after: "",
  modified_before: "",

  // User Filters
  created_by: "",
  exclude_created_by: "",
  modified_by: "",
  exclude_modified_by: "",

  // Advanced Filters
  similarity_threshold: "",
  cutoff_threshold: "",
  deduplicate_by_hash: false,

  // Search Settings
  limit: 50,
  embedding_knn_search_method: "exact",
};
