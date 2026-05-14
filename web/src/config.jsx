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

  // SSO 登录页面 URL（弹窗打开的目标地址）
  // 本地开发时走代理无效（浏览器导航不经过 proxy），需要指向真实服务器
  // 生产部署时使用相对路径 /omni/auth/login（nginx 反代）
  SSO_LOGIN_URL: process.env.REACT_APP_SSO_LOGIN_URL || "/omni/auth/login",

  // === LM CUSTOMIZATION: SSO Bridge — postMessage origin 白名单与调试开关 START ===
  // 原因：本地开发环境（localhost:3000）打开远程域 SSO 弹窗后，必须通过 postMessage
  //       跨域回传 token；为防止恶意页面伪造消息，主页对收到的 message.origin 严格校验。
  // 合入英伟达新版时：本块独立可移除（NVIDIA 原版无 SSO 弹窗 postMessage 通道）。
  //
  // 默认白名单：包含本地开发与已知部署域；可通过 env 追加（逗号分隔），自动与默认列表合并去重。
  SSO_BRIDGE_TRUSTED_ORIGINS: (() => {
    const defaults = [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://lightart-dev.woa.com",
      "https://market.lightart-dev.woa.com",
    ];
    const extra = (process.env.REACT_APP_SSO_BRIDGE_TRUSTED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set([...defaults, ...extra]));
  })(),
  // 调试开关：开启后输出每次轮询、每条 message、每次 origin 校验日志，便于本地联调定位
  SSO_DEBUG: process.env.REACT_APP_SSO_DEBUG === "true",
  // === LM CUSTOMIZATION: SSO Bridge END ===
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
