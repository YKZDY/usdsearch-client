/**
 * API Proxy for local development.
 *
 * Create React App automatically picks up src/setupProxy.js
 * when running `npm start`. It uses Express-style middleware.
 *
 * === MODE SELECTION ===
 * - Default (REACT_APP_USE_MOCK unset or "false"):
 *     Reverse-proxy all API calls to the real backend specified by
 *     REACT_APP_PROXY_TARGET (defaults to https://ov.qq.com).
 *
 * - REACT_APP_USE_MOCK=true:
 *     Use local mock data from setupProxy.mock.js (same as before).
 *     Useful when you have no network access or just need UI preview.
 *
 * To switch modes, edit .env.local and restart the dev server.
 *
 * === LM CUSTOMIZATION ===
 * 原始 mock 逻辑已备份到 setupProxy.mock.js
 * 合入英伟达新版本时：如上游修改了 setupProxy.js，
 *   将上游变更合并到 setupProxy.mock.js，此文件保持代理逻辑不变。
 */

const USE_MOCK = process.env.REACT_APP_USE_MOCK === 'true';

if (USE_MOCK) {
  // ── Mock 模式：加载备份的 mock 逻辑 ──
  module.exports = require('./setupProxy.mock.js');
} else {
  // ── 反向代理模式：转发到真实后端 ──
  const { createProxyMiddleware } = require('http-proxy-middleware');

  const PROXY_TARGET = process.env.REACT_APP_PROXY_TARGET || 'https://ov.qq.com';

  // 需要代理的 API 路径列表
  const API_PATHS = [
    '/search_hybrid',
    '/search',
    '/info',
    '/image',
    '/images',
    '/asset',
    '/process',
    '/search/stats',
    '/omni/discovery',  // Nucleus discovery（token refresh 需要）
    '/omni/auth',       // SSO 登录弹窗（Nucleus Auth 页面 + API）
  ];

  module.exports = function (app) {
    const proxy = createProxyMiddleware({
      target: PROXY_TARGET,
      changeOrigin: true,
      secure: true,
      // 日志：仅打印请求方法和路径，方便调试
      onProxyReq: (proxyReq, req) => {
        console.log(`[Proxy] ${req.method} ${req.path} → ${PROXY_TARGET}${req.path}`);
      },
      onProxyRes: (proxyRes, req) => {
        console.log(`[Proxy] ${req.method} ${req.path} ← ${proxyRes.statusCode}`);
      },
      onError: (err, req, res) => {
        console.error(`[Proxy] Error: ${req.method} ${req.path}`, err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
      },
    });

    // 注册每个 API 路径
    API_PATHS.forEach((path) => {
      app.use(path, proxy);
    });

    console.log('\n====================================');
    console.log('  🔗 Reverse Proxy is ACTIVE');
    console.log(`  Target: ${PROXY_TARGET}`);
    console.log('  API paths:', API_PATHS.join(', '));
    console.log('  Set REACT_APP_USE_MOCK=true to use mock data.');
    console.log('====================================\n');
  };
}
