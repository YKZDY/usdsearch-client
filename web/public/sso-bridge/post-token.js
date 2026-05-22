/* eslint-disable */
/**
 * SSO Bridge — post-token.js
 * ============================================================================
 * 用途：部署在 lightart-dev.woa.com（与 Nucleus Auth 同域），通过 nginx
 *      `sub_filter` 注入到 `/omni/auth/` 默认页响应中。SAML 登录完成后
 *      Nucleus Auth 会把 JWT 写入 localStorage(key='omni_access_token')，
 *      本脚本检测到后通过 window.opener.postMessage 把 token 跨域发回主页。
 *
 * 部署：
 *   1. 上传到 nginx 静态目录（与 location /sso-bridge/ alias 路径对应）
 *   2. 在 /omni/auth/ location 内追加 sub_filter 注入 <script src=...>
 *
 * 关键策略：
 *   - 同时支持立即检测 + 200ms 间隔轮询 10 秒（覆盖 token 异步写入场景）
 *   - 严格的 origin 白名单 + 必须从 query.opener_origin 显式接收主页 origin
 *   - 没有 window.opener 时完全静默，不污染普通用户使用 Nucleus Auth 的体验
 *   - 不依赖任何 Nucleus Auth 的 CSS / JS / DOM 结构，纯独立运行
 *
 * 与主页 ssoBridge.js 协议保持一致：
 *   { type: 'sso-token', token, source: 'sso-bridge' }
 *   { type: 'sso-timeout' }
 */
(function () {
  'use strict';

  // 防止 sub_filter 被多次注入或脚本被多次加载导致重复执行
  if (window.__SSO_BRIDGE_LOADED__) return;
  window.__SSO_BRIDGE_LOADED__ = true;

  // ========== 配置常量 ==========
  var TOKEN_KEY = 'omni_access_token';
  var REFRESH_TOKEN_KEY = 'omni_refresh_token';
  var POLL_INTERVAL_MS = 200;
  var POLL_TIMEOUT_MS = 10 * 1000; // 10 秒
  var CLOSE_DELAY_MS = 500;

  // origin 白名单（与主页 AUTH_CONFIG.SSO_BRIDGE_TRUSTED_ORIGINS 保持一致）
  var TRUSTED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://lightart-dev.woa.com',
    'https://market.lightart-dev.woa.com'
  ];

  // ========== 双语兜底文案 ==========
  var lang = (navigator.language || 'en').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
  var I18N = {
    en: {
      success: 'Login successful, returning to app…',
      timeout: 'Login timed out',
      noOpener: ''
    },
    zh: {
      success: '登录成功，正在返回主页…',
      timeout: '登录已超时',
      noOpener: ''
    }
  };
  function t(key) {
    return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || '';
  }

  // ========== 工具函数 ==========
  function log() {
    if (window.__SSO_BRIDGE_DEBUG__) {
      try { console.log.apply(console, ['[SSO-Bridge]'].concat([].slice.call(arguments))); } catch (e) {}
    }
  }

  function readToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function readRefreshToken() {
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY) || undefined;
    } catch (e) {
      return undefined;
    }
  }

  function isValidJwt(token) {
    if (!token || typeof token !== 'string') return false;
    var parts = token.split('.');
    if (parts.length !== 3) return false;
    return parts.every(function (p) { return p && /^[A-Za-z0-9_-]+$/.test(p); });
  }

  function parseOpenerOrigin() {
    // 1) 优先从 query 取 ?opener_origin=...
    try {
      var search = window.location.search || '';
      var match = search.match(/[?&]opener_origin=([^&#]+)/);
      if (match) {
        var decoded = decodeURIComponent(match[1]);
        if (TRUSTED_ORIGINS.indexOf(decoded) !== -1) return decoded;
        log('opener_origin from query not in whitelist:', decoded);
      }
    } catch (e) { /* ignore */ }

    // 2) 回退：document.referrer（弹窗第一次跳转后可能丢失，可信度较低）
    try {
      var ref = document.referrer || '';
      if (ref) {
        var u = new URL(ref);
        var refOrigin = u.origin;
        if (TRUSTED_ORIGINS.indexOf(refOrigin) !== -1) {
          log('opener_origin fallback to referrer:', refOrigin);
          return refOrigin;
        }
      }
    } catch (e) { /* ignore */ }

    return null;
  }

  // ========== 浮层 UI（最小内联样式，独立运行不依赖任何 CSS） ==========
  function ensureOverlay() {
    var existing = document.getElementById('__sso_bridge_overlay__');
    if (existing) return existing;
    var el = document.createElement('div');
    el.id = '__sso_bridge_overlay__';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = [
      'position:fixed',
      'top:16px',
      'right:16px',
      'z-index:2147483647',
      'min-width:220px',
      'max-width:320px',
      'padding:12px 16px',
      'background:rgba(20,20,24,0.92)',
      'color:#fff',
      'font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
      'border-radius:12px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
      'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)',
      'border:1px solid rgba(255,210,48,0.35)',
      'display:flex',
      'align-items:center',
      'gap:10px'
    ].join(';');
    // 加 spinner（纯 CSS）
    var spinner = document.createElement('span');
    spinner.id = '__sso_bridge_spinner__';
    spinner.style.cssText = [
      'width:14px',
      'height:14px',
      'border:2px solid rgba(255,210,48,0.45)',
      'border-top-color:#FFD230',
      'border-radius:50%',
      'display:inline-block',
      'flex:0 0 auto',
      'animation:__sso_spin__ 0.8s linear infinite'
    ].join(';');
    var msg = document.createElement('span');
    msg.id = '__sso_bridge_message__';
    msg.textContent = '';
    el.appendChild(spinner);
    el.appendChild(msg);

    // 注入 keyframes 仅一次
    if (!document.getElementById('__sso_bridge_style__')) {
      var style = document.createElement('style');
      style.id = '__sso_bridge_style__';
      style.textContent = '@keyframes __sso_spin__ { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }

    if (document.body) {
      document.body.appendChild(el);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.appendChild(el);
      });
    }
    return el;
  }

  function showOverlay(text, opts) {
    opts = opts || {};
    var el = ensureOverlay();
    var msg = document.getElementById('__sso_bridge_message__');
    var spinner = document.getElementById('__sso_bridge_spinner__');
    if (msg) msg.textContent = text;
    if (spinner) spinner.style.display = opts.hideSpinner ? 'none' : 'inline-block';
    el.style.display = 'flex';
  }

  // ========== 核心流程 ==========
  var openerOrigin = parseOpenerOrigin();

  // 没有 opener 或 opener_origin 不在白名单 → 完全静默，不显示浮层
  if (!window.opener || !openerOrigin) {
    log('no opener or untrusted opener_origin — staying idle');
    return;
  }

  log('starting bridge, opener_origin =', openerOrigin);

  var fired = false;
  var pollTimer = null;
  var deadline = Date.now() + POLL_TIMEOUT_MS;

  function sendToken(token) {
    if (fired) return;
    fired = true;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

    try {
      window.opener.postMessage({
        type: 'sso-token',
        token: token,
        refreshToken: readRefreshToken(),
        source: 'sso-bridge'
      }, openerOrigin);
      log('postMessage sent to', openerOrigin);
    } catch (e) {
      log('postMessage failed:', e);
      return;
    }

    showOverlay(t('success'));
    // 给主页 500ms 处理时间再关闭弹窗
    setTimeout(function () {
      try { window.close(); } catch (e) { /* ignore */ }
    }, CLOSE_DELAY_MS);
  }

  function sendTimeout() {
    if (fired) return;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    try {
      window.opener.postMessage({ type: 'sso-timeout', source: 'sso-bridge' }, openerOrigin);
    } catch (e) { /* ignore */ }
    showOverlay(t('timeout'), { hideSpinner: true });
    // 不主动 window.close()，让用户自己决定关闭
  }

  function checkOnce() {
    var token = readToken();
    if (token) {
      if (isValidJwt(token)) {
        sendToken(token);
      } else {
        log('token present but not valid JWT format — keep polling');
      }
    }
  }

  // 立即检测一次（覆盖 Nucleus Auth 同步写入场景）
  checkOnce();

  // 启动间隔轮询（覆盖异步写入场景）
  if (!fired) {
    pollTimer = setInterval(function () {
      if (Date.now() >= deadline) {
        sendTimeout();
        return;
      }
      checkOnce();
    }, POLL_INTERVAL_MS);
  }
})();
