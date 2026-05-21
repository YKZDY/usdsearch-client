/**
 * authReauthBus.js
 *
 * 统一的"请求重新登录"事件总线。
 *
 * 背景（P0 修复 fix/lm-tag-wss-auth-expiry）：
 *   wss `/omni/tagging3` 鉴权失败时，浏览器 WebSocket API 不走 fetch，
 *   useAuthGuard 的全局 fetch 拦截器无法感知，导致 Tag 写操作失败时
 *   只能在 panel 角落显示红色 chip，没有像 HTTP 401 那样弹出统一的
 *   Device Flow 重登录 Modal。
 *
 *   本模块封装"派发 auth-guard-open 事件"的标准入口，让 wss 路径
 *   （taggingService refresh 失败 / useTagManager preflight isExpired /
 *   useTagManager addTag/removeTag catch auth）能复用 useAuthGuard
 *   现有的 hasShownRef 幂等 + 错位 50ms Device Flow 自动启动链路。
 *
 * 设计原则：
 *   1. 不引入新的全局事件名，复用 'auth-guard-open' / 'auth-auto-device-flow'
 *      （定义在 hooks/useAuthGuard.js）
 *   2. 不在本模块做幂等控制，让 useAuthGuard.hasShownRef 兜底
 *   3. console.info 标注 reason，方便 T0 排查
 *
 * 使用示例：
 *   import { requestReauth } from '../utils/authReauthBus';
 *   requestReauth('wss-auth-fail', { serverUrl: 'ov.qq.com' });
 */

// 与 useAuthGuard.js 中的常量保持同步（不直接 import 避免反向依赖）
const AUTH_GUARD_OPEN_EVENT = 'auth-guard-open';

/**
 * 已知的 wss 侧 reauth 触发原因。
 *
 * - 'wss-auth-fail'      : tag 增删时 wss 握手返回 1008 / 服务端拒绝
 * - 'wss-token-expired'  : preflight 检测到 nucleus_access_token 过期且 refresh 也失败
 * - 'wss-refresh-failed' : refreshAccessToken 抛错，refresh_token 已失效
 *
 * 与 useAuthGuard 内部已有的 'no-token' / 'expired' / 'http-401' 并列。
 *
 * @typedef {'wss-auth-fail'|'wss-token-expired'|'wss-refresh-failed'} ReauthReason
 */

/**
 * 派发统一的"请求重新登录"事件。
 *
 * useAuthGuard 监听 'auth-guard-open' 后会：
 *   1. 打开 HeaderIcons Popover（露出 AuthForm）
 *   2. 错位 50ms 派发 'auth-auto-device-flow' 触发 AuthForm 自动启动 Device Flow
 *   3. 通过 hasShownRef 防止短时间内重复弹出（连续点 5 次 tag 仅弹 1 次）
 *
 * @param {ReauthReason} reason 触发原因，便于 T0 排查
 * @param {{ serverUrl?: string }} [options]
 *   - serverUrl: 当前操作的 nucleus host，传给 useAuthGuard 选择正确的登录服务器
 */
export function requestReauth(reason, options = {}) {
  const { serverUrl } = options;
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    // SSR / 测试环境没有 window，静默跳过
    return;
  }

  // T0 友好日志：以 console.info 输出，与 [TaggingService] 系列前缀对齐
  // eslint-disable-next-line no-console
  console.info('[AuthReauthBus] request reauth', { reason, serverUrl: serverUrl || null });

  try {
    window.dispatchEvent(
      new CustomEvent(AUTH_GUARD_OPEN_EVENT, {
        detail: { reason, serverUrl },
      })
    );
  } catch (e) {
    // CustomEvent 在极旧浏览器可能不支持，降级到 Event
    try {
      const evt = document.createEvent('Event');
      evt.initEvent(AUTH_GUARD_OPEN_EVENT, false, false);
      evt.detail = { reason, serverUrl };
      window.dispatchEvent(evt);
    } catch (_) {
      // eslint-disable-next-line no-console
      console.warn('[AuthReauthBus] dispatch failed', e);
    }
  }
}

const authReauthBus = { requestReauth };
export default authReauthBus;
