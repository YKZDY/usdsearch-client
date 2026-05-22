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

/**
 * Nucleus Authentication Module
 * 
 * This module provides functions and React hooks for authenticating with
 * NVIDIA Omniverse Nucleus servers using the Device Flow (OAuth-like) pattern.
 * 
 * Usage:
 * 1. Call startDeviceFlow(serverUrl) to initiate authentication
 * 2. Display the user_code and verification_uri to the user
 * 3. Poll pollForToken() until the user completes authentication
 * 4. Optionally create a long-lived API token with createApiToken()
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import DiscoverySearch from "@omniverse/discovery";
import { DeviceFlow, Tokens, Credentials } from "@omniverse/auth";
import { AuthStatus } from "@omniverse/auth/data";
import WebSocketClient from "@omniverse/idl/connection/transport/websocket";

// Register the WebSocket transport with the ClientFactory
// This is required for the discovery service to create connections
WebSocketClient.register();

// Client ID for this application
const CLIENT_ID = "USD-Search-Explorer";

// ============================================================================
// [P1 fix/lm-tag-wss-auth-expiry] DiscoverySearch 实例缓存
// ----------------------------------------------------------------------------
// 背景：未登录态 / 登出后，pollForToken 每 5/10s 一次都会 new DiscoverySearch()
//   → discovery.find() 触发 SDK 内部 healthcheck 探测（path-based + port-based）
//   → 浏览器对 CORS 拒绝 / 426 Upgrade Required 必然写 console error（user-space 无法抑制）
//   → 单次未登录态会话累积 100+ red error，严重影响演示体验
//
// SDK 自身设计：
//   - DiscoverySearch 构造函数不发请求
//   - 真正发请求的是首次 find() → _connect() → _establish() → healthcheck
//   - _connect() 有 if (!this._ws) 缓存，同一实例后续 find() 不重做 healthcheck
//
// 修复思路：
//   - 全局缓存 DiscoverySearch 实例（per normalizedUrl）
//   - 不再每次 connectToService 都 new + close discovery（client transport 仍各自 close）
//   - 监听 auth-updated / storage 事件，登录态切换时清缓存避免跨用户串
//
// 紧急关闭开关（极端情况下回滚）：
//   sessionStorage.setItem('disableDiscoveryCache', '1') 后刷新页面即可
//
// 关联文档：docs/troubleshooting/discovery-healthcheck-noise.md
// ============================================================================

/** @type {Map<string, DiscoverySearch>} */
const discoveryCache = new Map();

/**
 * 检查紧急关闭开关。读取失败（隐私模式等）默认 false（启用缓存）。
 */
function isDiscoveryCacheDisabled() {
  try {
    return typeof window !== 'undefined'
      && window.sessionStorage?.getItem('disableDiscoveryCache') === '1';
  } catch {
    return false;
  }
}

/**
 * 拿到（或新建）指定 server 的 DiscoverySearch 实例。
 * 同 server 复用同一实例，避免重复 healthcheck。
 * @param {string} normalizedUrl
 * @returns {DiscoverySearch}
 */
function getDiscovery(normalizedUrl) {
  if (isDiscoveryCacheDisabled()) {
    // 退回 lm 原行为：每次新建，不缓存
    return new DiscoverySearch(normalizedUrl);
  }
  let cached = discoveryCache.get(normalizedUrl);
  if (!cached) {
    cached = new DiscoverySearch(normalizedUrl);
    discoveryCache.set(normalizedUrl, cached);
  }
  return cached;
}

/**
 * 失效缓存。
 *   - 不传参：清全部（登出 / 切服务器时调用）
 *   - 传 normalizedUrl：仅清该 server 实例
 * 清理时调 .close() 释放底层 WebSocket。
 * @param {string} [normalizedUrl]
 */
export function invalidateDiscoveryCache(normalizedUrl) {
  if (normalizedUrl) {
    const inst = discoveryCache.get(normalizedUrl);
    if (inst) {
      try { inst.close?.(); } catch (e) { /* ignore */ }
      discoveryCache.delete(normalizedUrl);
    }
    return;
  }
  // 全清
  discoveryCache.forEach((inst) => {
    try { inst.close?.(); } catch (e) { /* ignore */ }
  });
  discoveryCache.clear();
}

// 全局事件订阅：登录态切换时清缓存，避免持有 stale 连接或跨用户串
//   - auth-updated: authStorage.notifyAuthChanged 主动派发（同 tab 路径）
//   - storage:      其他 tab 改 localStorage 时触发（跨 tab 路径）
// 注意：模块顶层副作用只在 module 首次 import 时执行一次，与 React 生命周期解耦
if (typeof window !== 'undefined') {
  const onAuthChanged = () => {
    // 全清。下次 connectToService 会重新建立缓存
    invalidateDiscoveryCache();
  };
  window.addEventListener('auth-updated', onAuthChanged);
  // storage 事件只在 key 变化时清，避免无关 key（如多选 firstShown）触发清缓存
  window.addEventListener('storage', (e) => {
    if (!e?.key) return;
    if (/nucleus|username|password|api[_-]?key|nucleus_token/i.test(e.key)) {
      onAuthChanged();
    }
  });
}

/**
 * Convert a Nucleus server URL to a discovery-compatible format
 * Strips omniverse:// prefix if present and ensures proper format
 * @param {string} serverUrl - The Nucleus server URL (e.g., "omniverse://server.com" or "server.com")
 * @returns {string} - Clean server URL for discovery
 */
export function normalizeServerUrl(serverUrl) {
  if (!serverUrl) return '';
  
  // Remove omniverse:// prefix if present
  let normalized = serverUrl.replace(/^omniverse:\/\//, '');
  
  // Remove any trailing slashes
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  
  return normalized;
}

/**
 * Get the HTTPS URL for a Nucleus server (for browser navigation)
 * @param {string} serverUrl - The Nucleus server URL
 * @returns {string} - HTTPS URL
 */
export function getServerHttpsUrl(serverUrl) {
  const normalized = normalizeServerUrl(serverUrl);
  return `https://${normalized}`;
}

/**
 * Connect to a Nucleus service via the discovery service
 * @param {string} serverUrl - The Nucleus server URL
 * @param {Function} clientType - The client type to connect to (DeviceFlow, Tokens, Credentials)
 * @param {Object} capabilities - Optional capabilities object
 * @returns {Promise<Object>} - Connected client instance
 */
async function connectToService(serverUrl, clientType, capabilities = {}) {
  const normalizedUrl = normalizeServerUrl(serverUrl);
  // [P1] 复用缓存的 DiscoverySearch 实例，避免每次 new 都重做 healthcheck（消除 80%+ console 噪音）
  // 注意：不再在 finally 中 close discovery，但下面的 client transport (DeviceFlow/Tokens/Credentials)
  // 仍由各 entry 自己 close，避免泄漏 service-level WebSocket。
  const discovery = getDiscovery(normalizedUrl);

  const client = await discovery.find(
    clientType,
    { deployment: "external" },
    undefined,
    capabilities
  );

  if (!client) {
    throw new Error(`Failed to find ${clientType.name || 'service'} on ${normalizedUrl}`);
  }

  return client;
}

/**
 * Start the Device Flow authentication process
 * @param {string} serverUrl - The Nucleus server URL
 * @returns {Promise<Object>} - Device flow authorization result containing:
 *   - user_code: Code the user needs to enter
 *   - device_code: Code used to poll for token
 *   - verification_uri: URL where user enters the code
 *   - interval: Polling interval in seconds
 *   - expires_in: Expiration time in seconds
 */
export async function startDeviceFlow(serverUrl) {
  const deviceFlow = await connectToService(serverUrl, DeviceFlow);
  
  try {
    const result = await deviceFlow.authorize({ client_id: CLIENT_ID });
    
    if (result.status && result.status !== AuthStatus.OK) {
      throw new Error(`Authorization failed with status: ${result.status}`);
    }
    
    return {
      user_code: result.user_code,
      device_code: result.device_code,
      verification_uri: result.verification_uri,
      interval: result.interval || 10,
      expires_in: result.expires_in || 900,
      serverUrl: normalizeServerUrl(serverUrl),
    };
  } finally {
    if (deviceFlow?.transport?.close) {
      await deviceFlow.transport.close();
    }
  }
}

/**
 * Poll for token after user enters the device code
 * @param {string} serverUrl - The Nucleus server URL
 * @param {string} deviceCode - The device code from startDeviceFlow
 * @returns {Promise<Object>} - Token result or pending status:
 *   - status: AuthStatus (OK, Pending, Expired, etc.)
 *   - access_token: Access token (if status is OK)
 *   - refresh_token: Refresh token (if status is OK)
 *   - profile: User profile (if status is OK)
 */
export async function pollForToken(serverUrl, deviceCode) {
  const deviceFlow = await connectToService(serverUrl, DeviceFlow);
  
  try {
    const result = await deviceFlow.token({
      client_id: CLIENT_ID,
      device_code: deviceCode,
    });
    
    return {
      status: result.status,
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      profile: result.profile,
      username: result.username,
    };
  } finally {
    if (deviceFlow?.transport?.close) {
      await deviceFlow.transport.close();
    }
  }
}

/**
 * Create a long-lived API token
 * @param {string} serverUrl - The Nucleus server URL
 * @param {string} accessToken - A valid access token
 * @param {string} tokenName - Name for the API token
 * @param {string} expireAt - ISO-8601 date string for expiration (e.g., "2026-01-01T00:00:00Z")
 * @returns {Promise<Object>} - API token result:
 *   - api_token: The created API token
 *   - name: Token name
 */
export async function createApiToken(serverUrl, accessToken, tokenName, expireAt = null) {
  const tokens = await connectToService(serverUrl, Tokens);
  
  try {
    // Build request object, only including expire_at if it's set (for permanent tokens, omit it)
    const request = {
      access_token: accessToken,
      name: tokenName,
      client_id: CLIENT_ID,
    };
    if (expireAt) {
      request.expire_at = expireAt;
    }
    
    const result = await tokens.createApiToken(request);
    
    if (result.status && result.status !== AuthStatus.OK) {
      throw new Error(`Failed to create API token: ${result.status}`);
    }
    
    // Note: The response field is 'token', not 'api_token'
    return {
      api_token: result.token,
      name: tokenName,
    };
  } finally {
    if (tokens?.transport?.close) {
      await tokens.transport.close();
    }
  }
}

/**
 * Refresh an access token using a refresh token
 * @param {string} serverUrl - The Nucleus server URL
 * @param {string} refreshToken - The refresh token
 * @returns {Promise<Object>} - New tokens
 */
export async function refreshAccessToken(serverUrl, refreshToken) {
  const tokens = await connectToService(serverUrl, Tokens);
  
  try {
    const result = await tokens.refresh({
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });
    
    if (result.status === AuthStatus.OK) {
      return {
        status: result.status,
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      };
    } else {
      throw new Error(`Token refresh failed: ${result.status}`);
    }
  } finally {
    if (tokens?.transport?.close) {
      await tokens.transport.close();
    }
  }
}

/**
 * Authenticate with username/password credentials
 * @param {string} serverUrl - The Nucleus server URL
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Object>} - Authentication result
 */
export async function authenticateWithCredentials(serverUrl, username, password) {
  const credentials = await connectToService(serverUrl, Credentials, { auth: 0 });
  
  try {
    const result = await credentials.auth({
      username,
      password,
      client_id: CLIENT_ID,
    });
    
    return {
      status: result.status,
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      profile: result.profile,
      username: result.username,
    };
  } finally {
    if (credentials?.transport?.close) {
      await credentials.transport.close();
    }
  }
}

// ============================================================================
// React Hooks
// ============================================================================

/**
 * Hook for managing Device Flow authentication
 * @returns {Object} - Device flow state and methods
 */
export function useDeviceFlowAuth() {
  const [state, setState] = useState({
    isLoading: false,
    isPolling: false,
    error: null,
    deviceFlowData: null,
    authResult: null,
  });
  
  const pollingRef = useRef(null);
  const abortRef = useRef(false);

  // Start the device flow
  const startAuth = useCallback(async (serverUrl) => {
    setState(prev => ({ ...prev, isLoading: true, error: null, deviceFlowData: null, authResult: null }));
    abortRef.current = false;
    
    try {
      const result = await startDeviceFlow(serverUrl);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        deviceFlowData: result,
      }));
      return result;
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error.message || 'Failed to start device flow',
      }));
      throw error;
    }
  }, []);

  // Poll for token
  // [P1 fix/lm-tag-wss-auth-expiry] 默认 interval 5s → 10s
  //   - user_code 15min 内有效，10s 轮询足够及时（用户从看到 code 到完成登录通常 30s-2min）
  //   - 配合 DiscoverySearch 缓存，单次未登录态会话的 console 噪音从 ~120 降到 ~20
  //   - 调用方（如 index.js startPolling(backend, result.device_code, result.interval)）
  //     传了 server 返回的 interval 时仍尊重 server 值，仅默认值改为 10
  const startPolling = useCallback(async (serverUrl, deviceCode, interval = 10) => {
    setState(prev => ({ ...prev, isPolling: true, error: null }));
    abortRef.current = false;
    
    const poll = async () => {
      if (abortRef.current) {
        setState(prev => ({ ...prev, isPolling: false }));
        return;
      }
      
      try {
        const result = await pollForToken(serverUrl, deviceCode);
        
        if (result.status === AuthStatus.OK) {
          setState(prev => ({ 
            ...prev, 
            isPolling: false, 
            authResult: result,
          }));
          return result;
        } else if (result.status === AuthStatus.Pending) {
          // Continue polling
          if (!abortRef.current) {
            pollingRef.current = setTimeout(poll, interval * 1000);
          }
        } else if (result.status === AuthStatus.Expired) {
          setState(prev => ({ 
            ...prev, 
            isPolling: false, 
            error: 'Device code expired. Please try again.',
          }));
        } else {
          setState(prev => ({ 
            ...prev, 
            isPolling: false, 
            error: `Authentication failed: ${result.status}`,
          }));
        }
      } catch (error) {
        if (!abortRef.current) {
          setState(prev => ({ 
            ...prev, 
            isPolling: false, 
            error: error.message || 'Polling failed',
          }));
        }
      }
    };
    
    return poll();
  }, []);

  // Stop polling
  const stopPolling = useCallback(() => {
    abortRef.current = true;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    setState(prev => ({ ...prev, isPolling: false }));
  }, []);

  // Reset state
  const reset = useCallback(() => {
    stopPolling();
    setState({
      isLoading: false,
      isPolling: false,
      error: null,
      deviceFlowData: null,
      authResult: null,
    });
  }, [stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startAuth,
    startPolling,
    stopPolling,
    reset,
  };
}

/**
 * Hook for creating API tokens
 * @returns {Object} - API token creation state and methods
 */
export function useCreateApiToken() {
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    apiToken: null,
  });

  const createToken = useCallback(async (serverUrl, accessToken, tokenName, expireAt) => {
    setState({ isLoading: true, error: null, apiToken: null });
    
    try {
      const result = await createApiToken(serverUrl, accessToken, tokenName, expireAt);
      setState({ isLoading: false, error: null, apiToken: result.api_token });
      return result;
    } catch (error) {
      setState({ isLoading: false, error: error.message || 'Failed to create API token', apiToken: null });
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ isLoading: false, error: null, apiToken: null });
  }, []);

  return {
    ...state,
    createToken,
    reset,
  };
}

// ============================================================================
// Auth Status Constants (re-exported for convenience)
// ============================================================================

export { AuthStatus };

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Functions
  normalizeServerUrl,
  getServerHttpsUrl,
  startDeviceFlow,
  pollForToken,
  createApiToken,
  refreshAccessToken,
  authenticateWithCredentials,
  // [P1] discovery 缓存管理（紧急情况下可手动清）
  invalidateDiscoveryCache,
  
  // Hooks
  useDeviceFlowAuth,
  useCreateApiToken,
  
  // Constants
  AuthStatus,
  CLIENT_ID,
};

