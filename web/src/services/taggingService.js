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
 * @returns {Promise<object>} - 响应 body
 */
async function call(serverUrl, authToken, method, params) {
  // 构建 wss URL（认证通过 query param）
  const host = (serverUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

  // [Tag Deploy Fix - 防线 4] host 合法性 guard：杜绝 wss://omniverse/... 这种非法请求
  // 早 reject 比让浏览器静默握手失败更友好，errMsg 也利于运维定位部署配置问题
  if (!isValidNucleusHost(host)) {
    console.error('[TaggingService] Invalid nucleus host, refuse wss call:', { host, method });
    return Promise.reject(new Error(`Invalid nucleus host: "${host}". Please check URL ?server= parameter or SERVER_MAPPING config.`));
  }

  const wsUrl = `wss://${host}${ENDPOINT}?access_token=${encodeURIComponent(authToken)}`;

  return new Promise((resolve, reject) => {
    let timer;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    const cleanup = () => {
      clearTimeout(timer);
      try { ws.close(); } catch (_) { /* ignore */ }
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`TaggingService.${method} timeout (${TIMEOUT_MS}ms)`));
    }, TIMEOUT_MS);

    ws.onopen = () => {
      const { frame } = buildSendRequestFrame('TaggingService', method, params);
      ws.send(frame);
    };

    ws.onmessage = (ev) => {
      try {
        const result = parseResponseFrame(ev.data);
        if (result.type === 'error') {
          cleanup();
          reject(new Error(`TaggingService.${method} error [${result.codeName}]: ${result.message}`));
          return;
        }
        if (result.type === 'response') {
          cleanup();
          resolve(result.body);
          return;
        }
        // done / unknown → 忽略（短连接模式下不应出现流式响应）
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    ws.onerror = (ev) => {
      cleanup();
      reject(new Error(`TaggingService WebSocket error: ${ev.message || 'connection failed'}`));
    };

    ws.onclose = (ev) => {
      clearTimeout(timer);
      if (ev.code !== 1000 && ev.code !== 1005) {
        reject(new Error(`TaggingService WebSocket closed: code=${ev.code} reason=${ev.reason}`));
      }
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
 * @returns {Promise<{tags: Array<{name: string, tag_namespace: string, value: string}>}>}
 */
export async function getTags(serverUrl, authToken, assetPath) {
  const normPath = normalizeAssetPath(assetPath);
  const resp = await call(serverUrl, authToken, 'get_tags', {
    version: 3,
    auth_token: authToken,
    paths: [normPath],
    show_deleted: false,
  });

  // 响应格式: { version, status, path_result: [{ connection_status, tags: [...] }] }
  const pathResult = resp?.path_result?.[0];
  if (!pathResult || pathResult.connection_status_string !== 'OK') {
    throw new Error(`getTags failed: ${pathResult?.connection_status_string || 'unknown'}`);
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
 * @returns {Promise<{status: string[]}>}
 */
export async function modifyTags(serverUrl, authToken, assetPath, tags, modifyType = 2) {
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
  });

  // 响应格式: { version, path_result: [{ connection_status, status: ["OK", ...] }] }
  const pathResult = resp?.path_result?.[0];
  if (!pathResult || pathResult.connection_status_string !== 'OK') {
    throw new Error(`modifyTags failed: ${pathResult?.connection_status_string || resp?.status || 'unknown'}`);
  }

  return { status: pathResult.status || [] };
}

/**
 * 查询指定路径下的所有已有 tag（用于自动补全）
 * @param {string} serverUrl
 * @param {string} authToken
 * @param {string} parentPath - 如 "/Library/"
 * @returns {Promise<{tags: Array<{name: string}>}>}
 */
export async function tagQuery(serverUrl, authToken, parentPath) {
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
  });

  // 响应格式: { version, tags: [{name}], status }
  if (resp?.status !== 'OK') {
    throw new Error(`tagQuery failed: ${resp?.status || 'unknown'}`);
  }

  return { tags: resp.tags || [] };
}

// ─── Tagging Token 管理 ─────────────────────────────────────────────────────

// 缓存 access_token（有效期内避免重复 refresh）
let _cachedAccessToken = null;
let _cachedTokenExpiry = 0;
const TOKEN_REFRESH_MARGIN = 60 * 1000; // 提前 60 秒刷新

/**
 * 获取具有 tagging 写权限的 access_token
 * 
 * 策略：
 * 1. 如果内存缓存的 access_token 还没过期 → 直接返回
 * 2. 如果 localStorage 中有未过期的 access_token → 使用它
 * 3. 如果有 refresh_token → 尝试 wss 直连刷新
 * 4. 都没有 → fallback 到 getHeaders 中提取的 token（可能是只读 API Token）
 * 
 * @param {string} serverUrl - Nucleus server host（如 "ov.qq.com"）
 * @param {Function} getHeaders - 获取 auth headers 的函数
 * @returns {Promise<string|null>} - 可用的 access_token
 */
export async function getTaggingToken(serverUrl, getHeaders) {
  // 1. 内存缓存命中
  if (_cachedAccessToken && Date.now() < _cachedTokenExpiry - TOKEN_REFRESH_MARGIN) {
    return _cachedAccessToken;
  }

  // 2. 从 localStorage 读取（DeviceFlow 登录时存的 access_token）
  const storedToken = localStorage.getItem('nucleus_access_token')
    || localStorage.getItem(`${serverUrl}_nucleus_access_token`);
  const storedExpiry = localStorage.getItem('nucleus_access_token_expiry')
    || localStorage.getItem(`${serverUrl}_nucleus_access_token_expiry`);

  if (storedToken && storedExpiry && Date.now() < Number(storedExpiry) - TOKEN_REFRESH_MARGIN) {
    _cachedAccessToken = storedToken;
    _cachedTokenExpiry = Number(storedExpiry);
    return _cachedAccessToken;
  }

  // 3. 尝试用 refresh_token 刷新（走正规 IDL client，discovery 已代理解决 CORS）
  const refreshToken = localStorage.getItem('nucleus_refresh_token')
    || localStorage.getItem(`${serverUrl}_nucleus_refresh_token`);

  if (refreshToken && serverUrl) {
    try {
      const { refreshAccessToken } = await import('../nucleus');
      const result = await refreshAccessToken(serverUrl, refreshToken);
      if (result.access_token) {
        _cachedAccessToken = result.access_token;
        _cachedTokenExpiry = Date.now() + 25 * 60 * 1000;
        // 更新 localStorage
        localStorage.setItem('nucleus_access_token', result.access_token);
        localStorage.setItem('nucleus_access_token_expiry', String(_cachedTokenExpiry));
        if (result.refresh_token) {
          localStorage.setItem('nucleus_refresh_token', result.refresh_token);
          if (serverUrl) {
            localStorage.setItem(`${serverUrl}_nucleus_refresh_token`, result.refresh_token);
          }
        }
        return _cachedAccessToken;
      }
    } catch (e) {
      console.warn('[TaggingService] token refresh 失败，fallback 到 API Token:', e.message);
    }
  }

  // 4. Fallback：从 getHeaders 提取（可能是 API Token，写操作可能被 DENIED）
  return extractTokenFromHeaders(getHeaders);
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
