/**
 * SSO Bridge — postMessage 跨域 token 接收工具（LM CUSTOMIZATION 新增模块）
 * ============================================================================
 * 职责：
 *   1. 在主页注册 window 'message' 事件监听，从 SSO 弹窗（中转脚本 post-token.js）
 *      接收 token / timeout / error 消息
 *   2. 严格的 origin 白名单 + event.source 校验，防止恶意页面伪造消息
 *   3. JWT 三段式格式校验，避免后续 createApiToken 调用失败
 *   4. 一次性锁：第一条合法消息触发后忽略后续消息，防止 postMessage 与
 *      localStorage 轮询双通道并发触发重复登录流程
 *   5. 提供 buildSSOUrl 工具：自动追加 opener_origin query 参数
 *
 * 设计要点：
 *   - 不依赖 React，纯 JS 模块；返回 { start, stop } 句柄供调用方控制生命周期
 *   - 调试日志统一带 [SSO] 前缀，token 仅打印前 8 字符脱敏
 *   - 与 localStorage 轮询通道互不干扰，由调用方持有共享一次性锁（fired ref）
 *
 * 使用方式：
 *   const bridge = createSSOBridge({
 *     trustedOrigins: AUTH_CONFIG.SSO_BRIDGE_TRUSTED_ORIGINS,
 *     ssoWindowRef: { current: ssoWindow },
 *     onToken: ({ token, refreshToken, source }) => { ... },
 *     onTimeout: () => { ... },
 *     onError: (errorMessage) => { ... },
 *     debug: AUTH_CONFIG.SSO_DEBUG,
 *   });
 *   bridge.start();
 *   // 流程结束（成功/失败/卸载）
 *   bridge.stop();
 */

const LOG_PREFIX = "[SSO]";

/**
 * 校验 token 是否为合法 JWT 三段式（header.payload.signature）
 * 注意：仅做格式预校验，不做签名验签（签名验签在后端完成）
 */
export function isValidJwtFormat(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  // 每段都必须是非空 base64url 字符串
  return parts.every((p) => p && /^[A-Za-z0-9_-]+$/.test(p));
}

/**
 * Token 前 8 字符脱敏（用于日志）
 */
export function maskToken(token) {
  if (!token || typeof token !== "string") return "<empty>";
  if (token.length <= 8) return token + "...";
  return token.slice(0, 8) + "...";
}

/**
 * 在 baseUrl 上追加 opener_origin query；若已存在则不重复追加，保持配置覆盖能力。
 * @param {string} baseUrl 原始 SSO 登录页 URL（绝对或相对均可）
 * @param {string} openerOrigin 主页 origin（通常是 window.location.origin）
 * @returns {string} 拼接后 URL
 */
export function buildSSOUrl(baseUrl, openerOrigin) {
  if (!baseUrl) return baseUrl;
  if (!openerOrigin) return baseUrl;

  // 判定 baseUrl 是否已带 opener_origin 参数（不区分 ?/& 顺序）
  const hasOpenerParam = /[?&]opener_origin=/.test(baseUrl);
  if (hasOpenerParam) return baseUrl;

  const sep = baseUrl.includes("?") ? "&" : "?";
  return baseUrl + sep + "opener_origin=" + encodeURIComponent(openerOrigin);
}

/**
 * 创建 SSO Bridge 监听器
 * @param {object} options
 * @param {string[]} options.trustedOrigins postMessage origin 白名单
 * @param {{current: Window | null}} options.ssoWindowRef 弹窗 window 引用（用于 event.source 校验）
 * @param {(payload: {token: string, refreshToken?: string, source: string}) => void} options.onToken
 * @param {() => void} [options.onTimeout]
 * @param {(message: string) => void} [options.onError]
 * @param {boolean} [options.debug]
 * @returns {{start: () => void, stop: () => void, hasFired: () => boolean, reset: () => void}}
 */
export function createSSOBridge(options) {
  const {
    trustedOrigins = [],
    ssoWindowRef,
    onToken,
    onTimeout,
    onError,
    debug = false,
  } = options || {};

  if (typeof onToken !== "function") {
    throw new Error("[ssoBridge] onToken callback is required");
  }

  // 一次性锁：首条合法消息触发后忽略后续；调用方也可读取 hasFired() 与 localStorage 轮询通道协调
  let fired = false;
  let listening = false;
  let messageHandler = null;

  const log = (...args) => {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(LOG_PREFIX, ...args);
    }
  };

  const warn = (...args) => {
    // eslint-disable-next-line no-console
    console.warn(LOG_PREFIX, ...args);
  };

  const handleMessage = (event) => {
    // 1. 来源 origin 校验
    if (!trustedOrigins.includes(event.origin)) {
      log("ignored message from untrusted origin:", event.origin);
      return;
    }

    // 2. 数据结构基础校验
    const data = event.data;
    if (!data || typeof data !== "object" || typeof data.type !== "string") {
      log("ignored message with invalid data shape, origin:", event.origin);
      return;
    }

    // 3. event.source 与 ssoWindowRef.current 一致性校验（若调用方传入了 ref）
    //    部分浏览器在弹窗已 close 后 event.source 会变成 null，因此仅在 ref 仍持有
    //    有效引用时做严格匹配；ref 已置 null 时仅信任 origin
    const expectedSource = ssoWindowRef && ssoWindowRef.current;
    if (
      expectedSource &&
      event.source &&
      event.source !== expectedSource
    ) {
      log("ignored message — event.source mismatch, origin:", event.origin);
      return;
    }

    log("received message:", data.type, "from origin:", event.origin);

    switch (data.type) {
      case "sso-token": {
        if (fired) {
          log("token message arrived but bridge already fired (race with localStorage channel) — ignored");
          return;
        }
        const token = data.token;
        if (!isValidJwtFormat(token)) {
          warn("token format invalid — rejected");
          if (typeof onError === "function") onError("ssoTokenInvalid");
          return;
        }
        fired = true;
        log("token accepted:", maskToken(token), "source:", data.source);
        try {
          onToken({
            token,
            refreshToken: data.refreshToken,
            source: data.source || "sso-bridge",
          });
        } catch (err) {
          warn("onToken callback threw:", err);
        }
        break;
      }
      case "sso-timeout": {
        if (fired) return;
        log("timeout message received");
        if (typeof onTimeout === "function") {
          try {
            onTimeout();
          } catch (err) {
            warn("onTimeout callback threw:", err);
          }
        }
        break;
      }
      case "sso-error": {
        if (fired) return;
        log("error message received:", data.message);
        if (typeof onError === "function") {
          try {
            onError(data.message || "ssoLoginFailed");
          } catch (err) {
            warn("onError callback threw:", err);
          }
        }
        break;
      }
      default:
        log("ignored unknown message type:", data.type);
    }
  };

  return {
    start() {
      if (listening) return;
      messageHandler = handleMessage;
      window.addEventListener("message", messageHandler, false);
      listening = true;
      log("bridge started, trusted origins:", trustedOrigins);
    },
    stop() {
      if (!listening) return;
      if (messageHandler) {
        window.removeEventListener("message", messageHandler, false);
      }
      messageHandler = null;
      listening = false;
      log("bridge stopped");
    },
    hasFired() {
      return fired;
    },
    /**
     * 由 localStorage 轮询通道在拿到 token 后调用，标记锁已触发，
     * 防止后续 postMessage 重复进入 onToken 流程
     */
    markFired() {
      fired = true;
      log("bridge marked fired by external channel (localStorage poll)");
    },
    reset() {
      fired = false;
      log("bridge fired flag reset");
    },
  };
}

export default createSSOBridge;
