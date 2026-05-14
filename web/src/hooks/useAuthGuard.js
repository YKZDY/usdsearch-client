/**
 * useAuthGuard - 登录态自动检查 Hook（v2 主动校验 + 生命周期感知）
 *
 * 升级点（相对 v1 被动检查 localStorage）：
 * 1. 启动时若 localStorage 有 token，发起 /info/plugins 主动校验有效性
 * 2. 网络 / 5xx 错误自动重试 1 次（3s 后）；仍失败 → 保留 token + 派发 offline 状态徽标
 * 3. 401/403 → 自动 clearExpiredCredentials（不写 auth_cleared）→ 派发 auth-guard-open 进入登录流程
 * 4. visibilitychange：切回本页时若距上次校验 > 30s，立即重新校验
 * 5. storage 监听：其他标签登录后立即同步本页状态
 * 6. selectedBackend 变更 → 重置 lastVerifiedRef 并立即重校验
 *
 * 事件协议：
 *   - dispatch: 'auth-guard-open'      detail: { reason, serverUrl }
 *   - dispatch: 'auth-verify-status'   detail: { status, server }  status ∈ verifying|ok|offline|expired
 *   - listen:   'auth-updated'         重置内部状态
 *   - listen:   'storage'              其他标签变更时同步
 *   - listen:   'visibilitychange'     切回本页时重校验
 */
import { useEffect, useRef, useCallback } from 'react';
import {
  hasStoredCredentials as hasStoredCredsUtil,
  getStoredAuth,
  isUserCleared,
  clearExpiredCredentials,
  getSSOToken,
} from '../utils/authStorage';

// 自定义事件名
export const AUTH_GUARD_OPEN_EVENT = 'auth-guard-open';
export const AUTH_VERIFY_STATUS_EVENT = 'auth-verify-status';
// === 触发 AuthForm 自动启动 Device Flow（复用其原生美观弹窗）===
export const AUTH_AUTO_DEVICE_FLOW_EVENT = 'auth-auto-device-flow';

// 切标签后重新校验的最小间隔（ms）
const VISIBILITY_REVERIFY_THROTTLE_MS = 30 * 1000;
// 网络/5xx 失败后的重试延迟（ms）
const RETRY_DELAY_MS = 3000;
// 校验请求超时（ms）
const VERIFY_TIMEOUT_MS = 10 * 1000;

/**
 * 构造 /info/plugins 请求 headers。
 * 优先使用 Bearer token（SSO JWT），回退到 Basic Auth / API Key。
 */
function buildAuthHeaders(server, auth) {
  const headers = { 'Content-Type': 'application/json' };
  if (server) headers['x-usdsearch-storage-backend'] = server;

  // 优先级 1: SSO JWT Bearer token
  const ssoToken = getSSOToken();
  if (ssoToken) {
    headers['Authorization'] = `Bearer ${ssoToken}`;
    return headers;
  }

  // 优先级 2: Basic Auth（含 Device Flow 生成的 $omni-api-token）
  if (auth.username && auth.username.trim() !== '') {
    headers['Authorization'] = `Basic ${btoa(`${auth.username}:${auth.password || ''}`)}`;
  } else if (auth.apiKey) {
    headers['x-api-key'] = auth.apiKey;
  }
  return headers;
}

/**
 * 派发状态事件，供右上角锁图标渲染徽标。
 */
function dispatchVerifyStatus(status, server) {
  window.dispatchEvent(new CustomEvent(AUTH_VERIFY_STATUS_EVENT, { detail: { status, server } }));
}

/**
 * 发起一次 token 校验请求。
 * @returns {Promise<'ok'|'expired'|'network'>}
 *   - 'ok'        : 2xx
 *   - 'expired'   : 401 / 403
 *   - 'network'   : 5xx / 网络错误 / 超时
 */
async function verifyOnce({ apiUrl, server, auth, signal }) {
  const base = apiUrl || '';
  const url = base ? `${base}/info/plugins` : `/info/plugins`;
  const headers = buildAuthHeaders(server, auth);

  // 叠加一个本地超时（部分浏览器对 fetch 默认无超时）
  const timeoutId = setTimeout(() => {
    try { signal?.dispatchEvent?.(new Event('abort')); } catch { /* ignore */ }
  }, VERIFY_TIMEOUT_MS);

  const response = await fetch(url, { method: 'GET', headers, signal }).catch((err) => {
    console.warn('[AuthGuard] verify network error:', err?.name || err?.message || err);
    return null;
  });
  clearTimeout(timeoutId);

  if (!response) return 'network';
  if (response.status === 401 || response.status === 403) return 'expired';
  if (response.status >= 500) return 'network';
  if (response.ok) return 'ok';
  // 其他非预期状态（404/400 等）按网络异常对待，不清值
  return 'network';
}

/**
 * @param {Object} options
 * @param {string} options.selectedBackend 当前后端标识（含 omniverse:// 前缀亦可）
 * @param {string} [options.apiUrl] 校验请求的 base URL；留空则走同源 /info/plugins
 * @param {boolean} [options.enabled=true]
 * @param {number} [options.checkDelay=1500] 首次检查延迟
 * @param {boolean} [options.enableLifecycleSync=true] 是否监听 visibilitychange
 */
export function useAuthGuard({
  selectedBackend = '',
  apiUrl = '',
  enabled = true,
  checkDelay = 1500,
  enableLifecycleSync = true,
} = {}) {
  const hasShownRef = useRef(false);
  const verifyingRef = useRef(false);
  const lastVerifiedAtRef = useRef(0);
  const originalFetchRef = useRef(null);
  const abortCtrlRef = useRef(null);

  // 触发打开登录弹窗（幂等）
  // - 派发 auth-guard-open → HeaderIcons 打开右上角 Popover（露出 AuthForm）
  // - 派发 auth-auto-device-flow → AuthForm 自动点击「从 Nucleus 获取令牌」，
  //   直接弹出原生美观的 Device Flow Modal（含 user_code + 跳转 ov.qq.com）
  const triggerAuthOpen = useCallback((reason) => {
    if (hasShownRef.current) return;
    hasShownRef.current = true;
    window.dispatchEvent(
      new CustomEvent(AUTH_GUARD_OPEN_EVENT, {
        detail: { reason: reason || 'no-token', serverUrl: selectedBackend },
      }),
    );
    // 错位 50ms 派发，让 Popover 先打开，AuthForm 挂载后再触发自动启动
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(AUTH_AUTO_DEVICE_FLOW_EVENT, {
          detail: { reason: reason || 'no-token', serverUrl: selectedBackend },
        }),
      );
    }, 50);
  }, [selectedBackend]);

  // 执行一次完整校验流程（含重试）
  const runVerify = useCallback(async () => {
    if (verifyingRef.current) return;
    if (isUserCleared(selectedBackend)) return;           // 用户主动登出，不骚扰
    if (!hasStoredCredsUtil(selectedBackend)) {
      // 无 token，直接触发登录
      triggerAuthOpen('no-token');
      return;
    }

    verifyingRef.current = true;
    dispatchVerifyStatus('verifying', selectedBackend);
    const auth = getStoredAuth(selectedBackend);

    abortCtrlRef.current?.abort();
    const controller = new AbortController();
    abortCtrlRef.current = controller;

    let result = await verifyOnce({ apiUrl, server: selectedBackend, auth, signal: controller.signal });

    // 网络错误重试 1 次
    if (result === 'network') {
      console.warn('[AuthGuard] verify network failed, retrying in 3s...');
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      if (controller.signal.aborted) { verifyingRef.current = false; return; }
      result = await verifyOnce({ apiUrl, server: selectedBackend, auth, signal: controller.signal });
    }

    verifyingRef.current = false;
    lastVerifiedAtRef.current = Date.now();

    if (result === 'ok') {
      dispatchVerifyStatus('ok', selectedBackend);
      hasShownRef.current = false; // 校验通过后允许下次失效时再弹
      return;
    }
    if (result === 'expired') {
      console.warn('[AuthGuard] token expired, auto-clearing credentials');
      dispatchVerifyStatus('expired', selectedBackend);
      clearExpiredCredentials(selectedBackend);
      triggerAuthOpen('expired');
      return;
    }
    // 'network'：保留凭证，通知右上角徽标
    console.warn('[AuthGuard] verify offline after retry, keep credentials');
    dispatchVerifyStatus('offline', selectedBackend);
  }, [apiUrl, selectedBackend, triggerAuthOpen]);

  // 1. 启动时的首次检查（延迟 checkDelay，让页面先渲染）
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setTimeout(() => { runVerify(); }, checkDelay);
    return () => {
      clearTimeout(timer);
      abortCtrlRef.current?.abort();
    };
  }, [enabled, checkDelay, runVerify]);

  // 2. selectedBackend 变化 → 重置并重新校验
  useEffect(() => {
    hasShownRef.current = false;
    lastVerifiedAtRef.current = 0;
  }, [selectedBackend]);

  // 3. 全局 fetch 拦截 401/403
  useEffect(() => {
    if (!enabled) return undefined;
    if (!originalFetchRef.current) originalFetchRef.current = window.fetch;
    const originalFetch = originalFetchRef.current;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401 || response.status === 403) {
        // 失效清值（不写 cleared）
        if (hasStoredCredsUtil(selectedBackend) && !isUserCleared(selectedBackend)) {
          console.warn('[AuthGuard] http 401/403 intercepted, auto-clearing');
          clearExpiredCredentials(selectedBackend);
        }
        hasShownRef.current = false;
        triggerAuthOpen('http-401');
      }
      return response;
    };

    return () => {
      if (originalFetchRef.current) window.fetch = originalFetchRef.current;
    };
  }, [enabled, selectedBackend, triggerAuthOpen]);

  // 4. 监听登录成功 / 外部 storage 变化 → 重置 guard
  useEffect(() => {
    const handleAuthUpdate = () => {
      if (hasStoredCredsUtil(selectedBackend) && !isUserCleared(selectedBackend)) {
        hasShownRef.current = false;
        lastVerifiedAtRef.current = Date.now();
        dispatchVerifyStatus('ok', selectedBackend);
      }
    };
    window.addEventListener('auth-updated', handleAuthUpdate);
    window.addEventListener('storage', handleAuthUpdate);
    return () => {
      window.removeEventListener('auth-updated', handleAuthUpdate);
      window.removeEventListener('storage', handleAuthUpdate);
    };
  }, [selectedBackend]);

  // 5. 标签页生命周期：切回本页后若距上次校验 > 30s 则重校验
  useEffect(() => {
    if (!enabled || !enableLifecycleSync) return undefined;
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const elapsed = Date.now() - lastVerifiedAtRef.current;
      if (elapsed < VISIBILITY_REVERIFY_THROTTLE_MS) {
        // 日志限频，避免频繁切标签刷屏
        return;
      }
      runVerify();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [enabled, enableLifecycleSync, runVerify]);

  return { hasStoredCredentials: () => hasStoredCredsUtil(selectedBackend), runVerify, triggerAuthOpen };
}

export default useAuthGuard;
