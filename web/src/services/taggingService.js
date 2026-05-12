/**
 * TaggingService - Nucleus Tagging3 WebSocket IDL Client
 * 
 * 通过 wss 帧协议与 Nucleus TaggingService 通信。
 * 协议格式：JSON over ArrayBuffer（每帧 = type(1B) + requestId(4B LE) + payload）
 * 
 * 端点：/omni/tagging3（通过 URL query param access_token 鉴权）
 */

const ENDPOINT = '/omni/tagging3';
const TIMEOUT_MS = 10000;

// 帧类型枚举
const FrameType = {
  STOP: 0,
  SEND: 1,       // SendRequest / SendResponse
  START: 2,      // StartRequest / StartResponse
  CONTINUE: 3,
  END: 4,
  DONE: 5,
};

// 错误码
const ErrorCode = {
  0x01: 'UnexpectedMessage',
  0x02: 'UnknownInterface',
  0x03: 'UnknownMethod',
  0x04: 'InvalidParams',
  0xFF: 'InternalServerError',
  0x100: 'ServiceError',
};

let _requestId = 0;

// ─── 结构化错误 ────────────────────────────────────────────────────────────
/**
 * TaggingError - 带分类信息的结构化错误，方便上层做精确提示
 *
 * 取代之前 `new Error('xxx')` 的裸抛模式：上层（useTagManager / EditableTagsPanel）
 * 只看 err.kind / err.stage / err.closeCode 这些字段就能决定 toast 文案，
 * 不再需要靠 err.message 字符串匹配。
 *
 * kind:   'auth' | 'network' | 'server-rejected' | 'invalid-host' | 'timeout' | 'unknown'
 * stage:  'preflight' | 'onopen' | 'onmessage' | 'onerror' | 'onclose'
 *   - preflight: 发 wss 之前就拒绝（host 非法 / token 过期）
 *   - onopen:    WebSocket 还没 open 就 onerror（最常见的握手失败）
 *   - onmessage: 服务端 error frame
 *   - onerror:   ws.onerror 触发
 *   - onclose:   非正常 close（code != 1000/1005）
 */
export class TaggingError extends Error {
  constructor({ kind, stage, message, hostUsed, method, tokenSource, closeCode, serverCode, jwtExp, clockSkewSuspected }) {
    super(message || `${kind || 'unknown'}@${stage || '?'}`);
    this.name = 'TaggingError';
    this.kind = kind || 'unknown';
    this.stage = stage || 'unknown';
    this.hostUsed = hostUsed || '';
    this.method = method || '';
    if (tokenSource) this.tokenSource = tokenSource;
    if (typeof closeCode === 'number') this.closeCode = closeCode;
    if (typeof serverCode === 'number') this.serverCode = serverCode;
    if (typeof jwtExp === 'number') this.jwtExp = jwtExp;
    if (clockSkewSuspected) this.clockSkewSuspected = true;
  }
}

/**
 * 解析 JWT 的 payload，提取 exp（秒级 unix ts）和 iat。不验签，仅看时间戳。
 * 非 JWT 形态（不透明 token / API Token）返回 null，调用方按"无 exp 信息"处理。
 *
 * 用于 [A1] preflight：在发 wss 之前就识别已过期 token，避免无效握手。
 */
function decodeJwtExp(token) {
  if (typeof token !== 'string' || !token) return null;
  // JWT 结构：header.payload.signature，3 段以点分隔
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payloadB64 = parts[1];
  if (!payloadB64) return null;
  try {
    // base64url → base64：替换字符并补 padding
    let b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = atob(b64);
    const payload = JSON.parse(json);
    const exp = typeof payload.exp === 'number' ? payload.exp : null;
    const iat = typeof payload.iat === 'number' ? payload.iat : null;
    return { exp, iat };
  } catch (_) {
    return null;
  }
}

/**
 * 截取 token 前 4 字符用于日志（绝不打印完整 token）
 */
function tokenHead4(token) {
  if (typeof token !== 'string' || !token) return '';
  return token.slice(0, 4);
}

/**
 * 构建 SendRequest 帧
 * 布局: type(1B) + requestId(4B LE) + "Interface.method\0" + paramsLen(4B LE) + paramsJSON
 */
function buildSendRequestFrame(interfaceName, methodName, params) {
  const reqId = ++_requestId;
  const callStr = `${interfaceName}.${methodName}`;
  const paramsJson = JSON.stringify(params);
  const paramsBuf = new TextEncoder().encode(paramsJson);

  // 计算帧总长度
  const callBytes = callStr.length + 1; // +1 for null terminator
  const totalLen = 1 + 4 + callBytes + 4 + paramsBuf.byteLength;

  const frame = new ArrayBuffer(totalLen);
  const view = new DataView(frame);
  const u8 = new Uint8Array(frame);

  let offset = 0;

  // type = SendRequest (1)
  view.setUint8(offset, FrameType.SEND);
  offset += 1;

  // requestId (uint32 LE)
  view.setUint32(offset, reqId, true);
  offset += 4;

  // method call string + null terminator
  for (let i = 0; i < callStr.length; i++) {
    u8[offset++] = callStr.charCodeAt(i);
  }
  u8[offset++] = 0; // null terminator

  // paramsLen (uint32 LE)
  view.setUint32(offset, paramsBuf.byteLength, true);
  offset += 4;

  // params JSON bytes
  u8.set(paramsBuf, offset);

  return { frame, reqId };
}

/**
 * 解析响应帧
 * SendResponse: type(1B) + reqId(4B LE) + last(1B) + paramsLen(4B LE) + paramsJSON
 * ErrorResponse: type(1B) + reqId(4B LE) + code(2B LE) + message(rest)
 */
function parseResponseFrame(buffer) {
  const view = new DataView(buffer);
  const type = view.getUint8(0);
  const requestId = view.getUint32(1, true);

  if (type === 0) {
    // Error response
    const code = view.getUint16(5, true);
    const msgBytes = new Uint8Array(buffer, 7);
    const message = new TextDecoder().decode(msgBytes);
    return { type: 'error', requestId, code, codeName: ErrorCode[code] || 'Unknown', message };
  }

  if (type === FrameType.SEND || type === FrameType.START) {
    const last = view.getUint8(5);
    const paramsLen = view.getUint32(6, true);
    const paramsBytes = new Uint8Array(buffer, 10, paramsLen);
    const json = new TextDecoder().decode(paramsBytes);
    const body = JSON.parse(json);
    return { type: 'response', requestId, last, body };
  }

  if (type === FrameType.DONE) {
    return { type: 'done', requestId };
  }

  return { type: 'unknown', requestId, rawType: type };
}

/**
 * [Tag Deploy Fix - 防线 4] 启发式判断是否为合法 nucleus host
 *
 * 合法：包含 '.'（域名形态）/ IPv4 字面量 / 'localhost'(:port)
 * 非法：裸标识符如 "omniverse"、"backend"、"nucleus"、空串、undefined
 *
 * 用浏览器纯字符串规则（无 DNS 同步接口可用），O(1)，零网络成本。
 *
 * 历史踩坑：部署环境 SERVER_MAPPING['omniverse'] 配错导致 host="omniverse"
 *           被拼成 wss://omniverse/...，浏览器无法解析，握手失败，
 *           乐观更新的 pending tag 在 ~500ms 内被回滚 → "tag 输入后消失"。
 */
export function isValidNucleusHost(host) {
  if (typeof host !== 'string') return false;
  const h = host.trim().toLowerCase();
  if (!h) return false;
  if (h === 'localhost' || h.startsWith('localhost:')) return true;
  // IPv4 (可带端口)
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(h)) return true;
  // 域名（至少一个点，且不能以点开头/结尾）
  if (h.includes('.') && !h.startsWith('.') && !h.endsWith('.')) return true;
  return false;
}

/**
 * 执行单次 RPC 调用（短连接模式）
 * @param {string} serverUrl - Nucleus 服务器地址（如 "ov.qq.com"）
 * @param {string} authToken - access_token
 * @param {string} method - 方法名（如 "get_tags"）
 * @param {object} params - 请求参数
 * @param {object} [meta] - 可选元数据，仅用于诊断（如 tokenSource）
 * @returns {Promise<object>} - 响应 body
 */
async function call(serverUrl, authToken, method, params, meta = {}) {
  // 构建 wss URL（认证通过 query param）
  const host = (serverUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const tokenSource = meta.tokenSource;

  // [Tag Deploy Fix - 防线 4] host 合法性 guard：杜绝 wss://omniverse/... 这种非法请求
  // 早 reject 比让浏览器静默握手失败更友好，errMsg 也利于运维定位部署配置问题
  if (!isValidNucleusHost(host)) {
    console.error('[TaggingService] Invalid nucleus host, refuse wss call:', { host, method, tokenSource });
    return Promise.reject(new TaggingError({
      kind: 'invalid-host',
      stage: 'preflight',
      hostUsed: host,
      method,
      tokenSource,
      message: `Invalid nucleus host: "${host}". Please check URL ?server= parameter or SERVER_MAPPING config.`,
    }));
  }

  // [TagFailureSurface] 入口诊断日志：非 production 完整 wsUrl；production 只 host+method
  // token 一律 head4 截断，绝不打印完整 token
  const isProd = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production');
  if (!isProd) {
    console.info('[TaggingService] dialing', {
      host,
      method,
      tokenSource,
      tokenLen: authToken ? authToken.length : 0,
      tokenHead4: tokenHead4(authToken),
    });
  }

  const wsUrl = `wss://${host}${ENDPOINT}?access_token=${encodeURIComponent(authToken)}`;

  return new Promise((resolve, reject) => {
    let timer;
    let opened = false;
    let settled = false;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    const cleanup = () => {
      clearTimeout(timer);
      try { ws.close(); } catch (_) { /* ignore */ }
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const succeed = (val) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(val);
    };

    timer = setTimeout(() => {
      fail(new TaggingError({
        kind: 'timeout',
        stage: opened ? 'onmessage' : 'onopen',
        hostUsed: host,
        method,
        tokenSource,
        message: `TaggingService.${method} timeout (${TIMEOUT_MS}ms)`,
      }));
    }, TIMEOUT_MS);

    ws.onopen = () => {
      opened = true;
      const { frame } = buildSendRequestFrame('TaggingService', method, params);
      ws.send(frame);
    };

    ws.onmessage = (ev) => {
      try {
        const result = parseResponseFrame(ev.data);
        if (result.type === 'error') {
          // 服务端 error frame：根据错误码分类
          // 0x01..0x04 多为请求格式问题，统一归为 server-rejected
          // 0xFF/0x100 内部错误也归 server-rejected（区别在 serverCode 字段）
          fail(new TaggingError({
            kind: 'server-rejected',
            stage: 'onmessage',
            hostUsed: host,
            method,
            tokenSource,
            serverCode: result.code,
            message: `TaggingService.${method} error [${result.codeName}]: ${result.message}`,
          }));
          return;
        }
        if (result.type === 'response') {
          succeed(result.body);
          return;
        }
        // done / unknown → 忽略（短连接模式下不应出现流式响应）
      } catch (e) {
        fail(new TaggingError({
          kind: 'unknown',
          stage: 'onmessage',
          hostUsed: host,
          method,
          tokenSource,
          message: `TaggingService.${method} parse error: ${e.message}`,
        }));
      }
    };

    ws.onerror = (ev) => {
      // wss 握手失败 / 网络中断 → kind=network（浏览器层面通常拿不到具体 status code）
      fail(new TaggingError({
        kind: 'network',
        stage: opened ? 'onerror' : 'onopen',
        hostUsed: host,
        method,
        tokenSource,
        message: `TaggingService WebSocket error: ${ev?.message || 'connection failed'}`,
      }));
    };

    ws.onclose = (ev) => {
      if (settled) return;
      // 非正常关闭：根据 code 推断 kind
      // 1000=Normal, 1005=No Status；其余都视为异常
      if (ev.code === 1000 || ev.code === 1005) {
        // 正常关闭但未收到响应：归 unknown
        fail(new TaggingError({
          kind: 'unknown',
          stage: 'onclose',
          hostUsed: host,
          method,
          tokenSource,
          closeCode: ev.code,
          message: `TaggingService closed before response: code=${ev.code} reason=${ev.reason || ''}`,
        }));
        return;
      }
      // 1006=Abnormal（多为网络/TLS/DNS）、1008=Policy（多为鉴权）、1011=Internal Error
      // 1015=TLS failure
      // 由于浏览器对 wss 握手失败通常返回 1006 且不暴露 HTTP 状态码，无法 100% 区分 auth/network。
      // 这里采用启发式：1008 → auth，其它 → network。
      let kind = 'network';
      if (ev.code === 1008) kind = 'auth';
      fail(new TaggingError({
        kind,
        stage: 'onclose',
        hostUsed: host,
        method,
        tokenSource,
        closeCode: ev.code,
        message: `TaggingService WebSocket closed: code=${ev.code} reason=${ev.reason || ''}`,
      }));
    };
  });
}

// ─── 公开 API ───────────────────────────────────────────────────────────────

/**
 * 规范化资产文件路径（用于 get_tags / modify_tags 的 paths 字段）
 *
 * 协议要求 paths 是纯路径，不能带 schema/host：
 *   "omniverse://ov.qq.com/Library/foo.fbx" → "/Library/foo.fbx"
 *   "omniverse://ov.qq.com:443/Library/foo.usd" → "/Library/foo.usd"
 *   "omni://host/Library/foo" → "/Library/foo"
 *   "/Library/foo.fbx" → "/Library/foo.fbx"
 *   "Library/foo.fbx" → "/Library/foo.fbx"
 *   "" / null → ""
 *
 * @param {string} input
 * @returns {string}
 */
export function normalizeAssetPath(input) {
  if (typeof input !== 'string' || !input) return '';

  let p = input.trim();

  // 1. 去掉 omniverse:// / omni:// 前缀
  if (p.startsWith('omniverse://')) p = p.slice('omniverse://'.length);
  else if (p.startsWith('omni://')) p = p.slice('omni://'.length);

  // 2. 若首字符不是 '/'，说明前面还有 host[:port]，去掉到第一个 '/'
  if (p.length > 0 && p[0] !== '/') {
    const slashIdx = p.indexOf('/');
    if (slashIdx === -1) {
      // 整个串都是 host，没有 path → 视为根
      return '/';
    }
    p = p.slice(slashIdx);
  }

  // 3. 确保以 '/' 开头（兜底，理论上前面已保证）
  if (!p.startsWith('/')) p = '/' + p;

  // 4. 去掉末尾的 '/'（文件路径不应带 trailing slash；'/' 本身保留）
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '');

  return p;
}

/**
 * 规范化目录路径（用于 tag_query 的 query.path 字段，需要 trailing '/'）
 *
 * @param {string} input
 * @returns {string}
 */
export function normalizeParentPath(input) {
  const p = normalizeAssetPath(input);
  if (!p) return '/';
  return p.endsWith('/') ? p : p + '/';
}

/**
 * 获取指定路径的 tags
 * @param {string} serverUrl - 如 "ov.qq.com"
 * @param {string} authToken - access_token
 * @param {string} assetPath - 如 "/Library/apple.fbx"
 * @param {object} [meta] - 可选元数据（如 { tokenSource: 'storage-prefixed' }），仅用于诊断
 * @returns {Promise<{tags: Array<{name: string, tag_namespace: string, value: string}>}>}
 */
export async function getTags(serverUrl, authToken, assetPath, meta = {}) {
  const normPath = normalizeAssetPath(assetPath);
  const resp = await call(serverUrl, authToken, 'get_tags', {
    version: 3,
    auth_token: authToken,
    paths: [normPath],
    show_deleted: false,
  }, meta);

  // 响应格式: { version, status, path_result: [{ connection_status, tags: [...] }] }
  const pathResult = resp?.path_result?.[0];
  if (!pathResult || pathResult.connection_status_string !== 'OK') {
    throw new TaggingError({
      kind: 'server-rejected',
      stage: 'onmessage',
      hostUsed: extractHost(serverUrl),
      method: 'get_tags',
      tokenSource: meta.tokenSource,
      message: `getTags failed: ${pathResult?.connection_status_string || 'unknown'}`,
    });
  }

  return { tags: pathResult.tags || [] };
}

/**
 * 修改指定路径的 tags（全量覆写）
 * @param {string} serverUrl
 * @param {string} authToken
 * @param {string} assetPath
 * @param {Array<{name: string, tag_namespace?: string, value?: string}>} tags - 完整 tag 列表
 * @param {number} modifyType - 2=全量覆写（默认）
 * @param {object} [meta] - 可选元数据（如 { tokenSource: 'storage-prefixed' }），仅用于诊断
 * @returns {Promise<{status: string[]}>}
 */
export async function modifyTags(serverUrl, authToken, assetPath, tags, modifyType = 2, meta = {}) {
  const normPath = normalizeAssetPath(assetPath);
  // 按 Navigator 协议：
  // - 有 user tags 时：每条带 name + namespace
  // - modify_type=2 是按 namespace 覆写：必须显式发送 { tag_namespace: "appearance" } 来声明该 namespace 的全量内容
  //   不带 name 的 namespace 条目 = "清空该 namespace"
  //   带 name 的条目 = "该 namespace 的完整 tag 列表"
  const fullTags = [
    ...tags.map(t => ({
      name: t.name,
      tag_namespace: t.tag_namespace || 'appearance',
      value: t.value || '',
    })),
    // 当 tags 为空时，这条清空主 namespace；有 tags 时，这条作为 namespace 声明（已有条目覆盖）
    { tag_namespace: 'appearance' },
    { tag_namespace: '.appearance.generated' },
    { tag_namespace: '.appearance.excluded' },
  ];

  const resp = await call(serverUrl, authToken, 'modify_tags', {
    version: 3,
    auth_token: authToken,
    paths: [normPath],
    tags: fullTags,
    modify_type: modifyType,
  }, meta);

  // 响应格式: { version, path_result: [{ connection_status, status: ["OK", ...] }] }
  const pathResult = resp?.path_result?.[0];
  if (!pathResult || pathResult.connection_status_string !== 'OK') {
    throw new TaggingError({
      kind: 'server-rejected',
      stage: 'onmessage',
      hostUsed: extractHost(serverUrl),
      method: 'modify_tags',
      tokenSource: meta.tokenSource,
      message: `modifyTags failed: ${pathResult?.connection_status_string || resp?.status || 'unknown'}`,
    });
  }

  return { status: pathResult.status || [] };
}

/**
 * 查询指定路径下的所有已有 tag（用于自动补全）
 * @param {string} serverUrl
 * @param {string} authToken
 * @param {string} parentPath - 如 "/Library/"
 * @param {object} [meta] - 可选元数据（如 { tokenSource: 'storage-prefixed' }），仅用于诊断
 * @returns {Promise<{tags: Array<{name: string}>}>}
 */
export async function tagQuery(serverUrl, authToken, parentPath, meta = {}) {
  const normParent = normalizeParentPath(parentPath);
  const resp = await call(serverUrl, authToken, 'tag_query', {
    version: 3,
    auth_token: authToken,
    query: { path: normParent },
    ret_filter: {
      return_paths: false,
      return_tags: true,
      return_namespaces: false,
      return_values: false,
      exclude_hidden: true,
    },
  }, meta);

  // 响应格式: { version, tags: [{name}], status }
  if (resp?.status !== 'OK') {
    throw new TaggingError({
      kind: 'server-rejected',
      stage: 'onmessage',
      hostUsed: extractHost(serverUrl),
      method: 'tag_query',
      tokenSource: meta.tokenSource,
      message: `tagQuery failed: ${resp?.status || 'unknown'}`,
    });
  }

  return { tags: resp.tags || [] };
}

// ─── Tagging Token 管理 ─────────────────────────────────────────────────────

// 缓存 access_token（有效期内避免重复 refresh）
let _cachedAccessToken = null;
let _cachedTokenExpiry = 0;
let _cachedTokenSource = null; // [TagFailureSurface] 记录上次命中的 token 来源
let _cachedTokenJwtExp = null; // [A1] 缓存解析出的 jwt exp（秒级 unix ts），nullable
const TOKEN_REFRESH_MARGIN = 60 * 1000; // 提前 60 秒刷新

/**
 * [A2] 清空内存中的 token 缓存
 *
 * 调用场景：
 * - useTagManager 监听到 'storage' / 'auth-updated' 事件 → 怀疑 localStorage 中 token 已变化
 * - 调用方自行决定何时强制重拉
 *
 * 不清 localStorage，只清进程内缓存，下次调 getTaggingTokenWithMeta 会重新走完整链路。
 *
 * @param {string} [_host] - 可选 host 参数；当前实现是全局缓存，host 仅作签名占位（未来若改成 per-host 缓存可用）
 */
export function clearTaggingTokenCache(_host) {
  _cachedAccessToken = null;
  _cachedTokenExpiry = 0;
  _cachedTokenSource = null;
  _cachedTokenJwtExp = null;
}

/**
 * [TagStorageKeyFix] 内部工具：把同一份 token 三件套写到所有候选 key 前缀下
 *
 * 调用场景：
 *  - 登录成功后的 refresh 写回（refreshToken 分支）
 *  - 未来若有其它"刷新/续期"路径同样可调用
 *
 * 行为：对去重后的 prefixes 依次 setItem 三对 key（access / refresh / expiry）。
 * 任一 setItem 异常仅 console.error，不影响后续 key 写入（不抛出，避免阻断主流程）。
 *
 * @param {string[]} prefixes - 已去重的 storage key 前缀列表（如 ['ov.qq.com', 'omniverse']）
 * @param {{access: string, refresh?: string, expiry?: string|number, bare?: boolean}} payload
 *        bare=true 时额外写一份无前缀 key（兜底，仅 refresh 路径使用）
 */
function persistTokenKeys(prefixes, payload) {
  const { access, refresh, expiry, bare } = payload || {};
  if (!access) return;
  const seen = new Set();
  const list = (prefixes || []).filter(p => {
    if (!p || typeof p !== 'string') return false;
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  try {
    if (bare) {
      localStorage.setItem('nucleus_access_token', access);
      if (refresh) localStorage.setItem('nucleus_refresh_token', refresh);
      if (expiry !== undefined && expiry !== null) localStorage.setItem('nucleus_access_token_expiry', String(expiry));
    }
    for (const p of list) {
      localStorage.setItem(`${p}_nucleus_access_token`, access);
      if (refresh) localStorage.setItem(`${p}_nucleus_refresh_token`, refresh);
      if (expiry !== undefined && expiry !== null) localStorage.setItem(`${p}_nucleus_access_token_expiry`, String(expiry));
    }
  } catch (e) {
    console.error('[TaggingService] persistTokenKeys failed', e);
  }
}

/**
 * [TagFailureSurface + A1 + TagStorageKeyFix] 获取 tagging token 并附带来源元信息
 *
 * 返回结构：
 *   {
 *     token: string|null,
 *     source: 'memory'|'storage-prefixed'|'storage-alias'|'storage-bare'|'refreshed'|'headers'|null,
 *     sourceAliasMatched?: string, // source==='storage-alias' 时命中的具体别名前缀
 *     expiresAt?: number,   // 来自 localStorage 的过期时间戳（毫秒）
 *     jwtExp?: number,      // JWT exp claim（秒级 unix ts），非 JWT token 为空
 *     isExpired?: boolean,  // preflight 综合判断结果
 *     clockSkewSuspected?: boolean
 *   }
 *
 * localStorage 读取顺序（[TagStorageKeyFix]）：
 *  1) 真实 host 前缀（serverUrl）  → source='storage-prefixed'
 *  2) options.storageKeyAliases 中的每个别名（按顺序）  → source='storage-alias'，sourceAliasMatched=命中的别名
 *  3) 无前缀（兼容老版本/跨 host 共享）  → source='storage-bare'
 *
 * 历史背景：
 *  index.js DeviceFlow 登录后用 selectedServer 原值（如 'omniverse'）作前缀写 key，
 *  而 service 层用 resolveNucleusHost 解析后的真实 host（如 'ov.qq.com'）查 key，
 *  导致新用户/无痕模式下 100% 读不到 token，被迫 fallback 到只读 API Token 而被服务端拒绝。
 *  调用方（useTagManager）现在会把 URL ?server= 原值作为 alias 传入。
 *
 * @param {string} serverUrl - Nucleus server host
 * @param {Function} getHeaders - 获取 auth headers 的函数
 * @param {object} [options]
 * @param {string[]} [options.storageKeyAliases] - 额外尝试的 storage prefix 候选（按顺序）
 * @returns {Promise<{token: string|null, source: string|null, sourceAliasMatched?: string, expiresAt?: number, jwtExp?: number, isExpired?: boolean, clockSkewSuspected?: boolean}>}
 */
export async function getTaggingTokenWithMeta(serverUrl, getHeaders, options = {}) {
  const storageKeyAliases = Array.isArray(options.storageKeyAliases) ? options.storageKeyAliases : [];

  // 1. 内存缓存命中
  if (_cachedAccessToken && Date.now() < _cachedTokenExpiry - TOKEN_REFRESH_MARGIN) {
    return {
      token: _cachedAccessToken,
      source: _cachedTokenSource || 'memory',
      expiresAt: _cachedTokenExpiry,
      jwtExp: _cachedTokenJwtExp || undefined,
      isExpired: false,
    };
  }

  // 2. 从 localStorage 读取（DeviceFlow 登录时存的 access_token）
  // [TagStorageKeyFix] 三级查找：真实 host → 别名列表 → 无前缀兜底
  let storedToken = null;
  let storedExpiry = null;
  let storageSource = null;
  let sourceAliasMatched = null;

  if (serverUrl) {
    storedToken = localStorage.getItem(`${serverUrl}_nucleus_access_token`);
    storedExpiry = localStorage.getItem(`${serverUrl}_nucleus_access_token_expiry`);
    if (storedToken) storageSource = 'storage-prefixed';
  }
  if (!storedToken) {
    for (const alias of storageKeyAliases) {
      if (!alias || alias === serverUrl) continue;
      const t = localStorage.getItem(`${alias}_nucleus_access_token`);
      if (t) {
        storedToken = t;
        storedExpiry = localStorage.getItem(`${alias}_nucleus_access_token_expiry`);
        storageSource = 'storage-alias';
        sourceAliasMatched = alias;
        break;
      }
    }
  }
  if (!storedToken) {
    storedToken = localStorage.getItem('nucleus_access_token');
    storedExpiry = localStorage.getItem('nucleus_access_token_expiry');
    if (storedToken) storageSource = 'storage-bare';
  }

  if (storedToken && storedExpiry) {
    const expiryNum = Number(storedExpiry);
    const jwtInfo = decodeJwtExp(storedToken);
    const jwtExp = jwtInfo?.exp ?? null;
    const now = Date.now();
    const stillValid = now < expiryNum - TOKEN_REFRESH_MARGIN;
    if (stillValid) {
      _cachedAccessToken = storedToken;
      _cachedTokenExpiry = expiryNum;
      _cachedTokenSource = storageSource;
      _cachedTokenJwtExp = jwtExp;
      const result = {
        token: storedToken,
        source: storageSource,
        expiresAt: expiryNum,
        jwtExp: jwtExp || undefined,
        isExpired: false,
      };
      if (sourceAliasMatched) result.sourceAliasMatched = sourceAliasMatched;
      return result;
    }
    // 已过期：先尝试 refresh，再 fallback；同时把 jwtExp 透传给调用方
    // 这里不立即返回 isExpired=true，让 refresh 有机会救回来
  }

  // 3. 尝试用 refresh_token 刷新（走正规 IDL client，discovery 已代理解决 CORS）
  // [TagStorageKeyFix] refresh_token 同样走三级查找
  let refreshToken = null;
  if (serverUrl) refreshToken = localStorage.getItem(`${serverUrl}_nucleus_refresh_token`);
  if (!refreshToken) {
    for (const alias of storageKeyAliases) {
      if (!alias || alias === serverUrl) continue;
      const t = localStorage.getItem(`${alias}_nucleus_refresh_token`);
      if (t) { refreshToken = t; break; }
    }
  }
  if (!refreshToken) refreshToken = localStorage.getItem('nucleus_refresh_token');

  if (refreshToken && serverUrl) {
    try {
      const { refreshAccessToken } = await import('../nucleus');
      const result = await refreshAccessToken(serverUrl, refreshToken);
      if (result.access_token) {
        _cachedAccessToken = result.access_token;
        _cachedTokenExpiry = Date.now() + 25 * 60 * 1000;
        _cachedTokenSource = 'refreshed';
        const jwtInfo = decodeJwtExp(result.access_token);
        _cachedTokenJwtExp = jwtInfo?.exp ?? null;
        // [TagStorageKeyFix] 用统一工具：host + 所有 alias + bare 全部写回，
        // 保证下次启动 index.js 读 alias key 时也能命中（避免 index.js 误判未登录）。
        const allPrefixes = [serverUrl, ...storageKeyAliases.filter(a => a && a !== serverUrl)];
        persistTokenKeys(allPrefixes, {
          access: result.access_token,
          refresh: result.refresh_token,
          expiry: _cachedTokenExpiry,
          bare: true,
        });
        return {
          token: _cachedAccessToken,
          source: 'refreshed',
          expiresAt: _cachedTokenExpiry,
          jwtExp: _cachedTokenJwtExp || undefined,
          isExpired: false,
        };
      }
    } catch (e) {
      console.warn('[TaggingService] token refresh 失败，fallback 到 API Token:', e.message);
    }
  }

  // 4. Fallback：从 getHeaders 提取（可能是 API Token，写操作可能被 DENIED）
  // 如果 localStorage 里有但已过期，把"已过期"信息带出去给 UI 用
  if (storedToken && storedExpiry) {
    const jwtInfo = decodeJwtExp(storedToken);
    const jwtExp = jwtInfo?.exp ?? null;
    const expiryNum = Number(storedExpiry);
    // 时钟偏移启发式：localStorage 里 expiry = Date.now() + 25min，而服务器签发的 jwtExp
    // 通常对应真实 TTL（约 30min）。正常情况下差异约 5min，所以用 10min 阈值避免误报。
    // 偏差 >10min → 怀疑本机系统时钟不准。
    const clockSkewSuspected = jwtExp
      ? Math.abs(expiryNum - jwtExp * 1000) > 10 * 60 * 1000
      : false;
    const headerToken = extractTokenFromHeaders(getHeaders);
    if (headerToken) {
      const result = {
        token: headerToken,
        source: 'headers',
        expiresAt: expiryNum,
        jwtExp: jwtExp || undefined,
        isExpired: true,
        clockSkewSuspected,
      };
      if (sourceAliasMatched) result.sourceAliasMatched = sourceAliasMatched;
      return result;
    }
    const result = {
      token: null,
      source: null,
      expiresAt: expiryNum,
      jwtExp: jwtExp || undefined,
      isExpired: true,
      clockSkewSuspected,
    };
    if (sourceAliasMatched) result.sourceAliasMatched = sourceAliasMatched;
    return result;
  }

  const headerToken = extractTokenFromHeaders(getHeaders);
  if (headerToken) {
    return { token: headerToken, source: 'headers', isExpired: false };
  }
  return { token: null, source: null, isExpired: false };
}

/**
 * 获取具有 tagging 写权限的 access_token（兼容入口，委托给 getTaggingTokenWithMeta）
 *
 * 保留旧签名以保证 useBatchTagger 等其他消费者无需改动。新调用方应优先使用 getTaggingTokenWithMeta。
 *
 * @param {string} serverUrl - Nucleus server host（如 "ov.qq.com"）
 * @param {Function} getHeaders - 获取 auth headers 的函数
 * @param {object} [options] - 同 getTaggingTokenWithMeta 的 options
 * @returns {Promise<string|null>} - 可用的 access_token
 */
export async function getTaggingToken(serverUrl, getHeaders, options) {
  const meta = await getTaggingTokenWithMeta(serverUrl, getHeaders, options);
  return meta.token;
}

/**
 * 从 getHeaders() 返回的 headers 中提取 auth token
 * @param {Function} getHeaders - 现有的 getHeaders prop
 * @returns {string|null} - access_token 或 null
 */
export function extractTokenFromHeaders(getHeaders) {
  if (!getHeaders) return null;
  try {
    const headers = getHeaders();
    // headers 可能是 Headers 对象或普通对象
    const auth = headers?.Authorization || headers?.authorization || headers?.get?.('Authorization');
    if (!auth) return null;

    // Bearer token → 直接返回 token
    if (auth.startsWith('Bearer ')) {
      return auth.slice(7);
    }

    // Basic Auth → 解码 base64，提取密码部分（即 nucleus_api_token）
    // 格式: "Basic base64($omni-api-token:<actual_token>)"
    if (auth.startsWith('Basic ')) {
      try {
        const decoded = atob(auth.slice(6));
        const colonIdx = decoded.indexOf(':');
        if (colonIdx !== -1) {
          return decoded.slice(colonIdx + 1);
        }
      } catch (_) { /* base64 decode failed, fallback */ }
    }

    // 其他情况直接返回
    return auth;
  } catch (_) { /* ignore */ }
  return null;
}

/**
 * 从 serverUrl 提取 host（去掉 protocol 和 path）
 * @param {string} url
 * @returns {string}
 */
export function extractHost(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/.*$/, '');
}
