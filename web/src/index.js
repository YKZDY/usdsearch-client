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

import React, {useState, useEffect, useRef, useMemo, useCallback} from 'react';
import * as ReactDOMClient from 'react-dom/client';
import {
    ChakraProvider,
    Box,
    Text,
    Button,
    Input,
    VStack,
    Image,
    FormLabel,
    useToast,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    useDisclosure, Heading, Flex, HStack, IconButton, Popover,
    PopoverTrigger, PopoverContent, PopoverArrow, PopoverCloseButton,
    PopoverHeader, PopoverBody, Divider, Select, Link, Tooltip
} from '@chakra-ui/react';
import { LockIcon, UnlockIcon, InfoIcon, ExternalLinkIcon, ChevronDownIcon, LinkIcon } from '@chakra-ui/icons';
import { motion } from 'framer-motion';
// === LM CUSTOMIZATION: i18n START ===
import { LanguageProvider, useTranslation } from './i18n/LanguageContext';
// === LM CUSTOMIZATION: i18n END ===

import {ColorModeScript} from '@chakra-ui/react';
import SearchApp from "./HybridDeepSearchUI";

// === LM CUSTOMIZATION: Brand START ===
import logo from './brand/logo';
// === LM CUSTOMIZATION: Brand END ===
// === LM CUSTOMIZATION: Sidebar START ===
import CategorySidebar from './components/CategorySidebar';
// === LM CUSTOMIZATION: Sidebar END ===
// === LM CUSTOMIZATION: TopSearchBar START ===
import TopSearchBar from './components/TopSearchBar';
// === LM CUSTOMIZATION: TopSearchBar END ===
import { apiUrl as defaultApiUrl, SERVER_MAPPING, defaultEmbeddingConfig, resolveNucleusHost, getDefaultServerKey, AUTH_CONFIG } from "./config";
import GraphVisualization from "./Graph";
import persistentCache from "./utils/persistentImageCache";
import { useDeviceFlowAuth, getServerHttpsUrl, AuthStatus, createApiToken } from "./nucleus";
// === LM CUSTOMIZATION: Auth Guard utils ===
import { clearAuthByUserAction, getSSOToken, persistSSOLogin, clearSSOLogin } from "./utils/authStorage";
// === LM CUSTOMIZATION: SSOPostMessage START ===
// 原因：本地开发环境（localhost:3000）与 SSO 弹窗完成后落在的 lightart-dev.woa.com
//       跨域，localStorage 互相隔离读不到 token；根据需求文档选型「postMessage
//       跨域中转」方案。2026-05-15 改回 demo 极简模式（只走 localStorage 轮询），
//       sso-bridge 工具暂未启用，文件保留以备后续切换。
// 合入英伟达新版时：本 import 块可直接移除（NVIDIA 原版无 SSO 弹窗 postMessage 通道）。
// === LM CUSTOMIZATION: SSOPostMessage 暂时下线（保留 import 占位） ===
// import { createSSOBridge, buildSSOUrl } from "./utils/ssoBridge";
// === LM CUSTOMIZATION: SSOPostMessage END ===

// === LM CUSTOMIZATION: Theme START ===
import theme, { LA } from './theme/laTheme';
// === LM CUSTOMIZATION: Theme END ===

// Authentication Form Component
const AuthForm = ({ auth, setAuth, getServerStorageKey, selectedServer = '' }) => {
    const { t } = useTranslation();
    const [authMethod, setAuthMethod] = useState(() => {
        if (auth.username) return 'basic';
        if (auth.api_key) return 'api_key';
        return 'basic';
    });
    
    // Device flow modal state
    const { isOpen: isDeviceFlowOpen, onOpen: onDeviceFlowOpen, onClose: onDeviceFlowClose } = useDisclosure();
    const deviceFlowAuth = useDeviceFlowAuth();
    const toast = useToast();

    // === LM CUSTOMIZATION: AuthGuard 自动触发 Device Flow ===
    // 监听 useAuthGuard 派发的 auth-auto-device-flow 事件 → 自动调用 handleStartDeviceFlow
    // 等待 backend 探测完成（避免 noServerDetected 拦截）；若已认证则忽略
    const pendingAutoStartRef = useRef(false);
    const autoStartTriggeredRef = useRef(false);

    // Helper function to check if backend is S3
    const isS3Backend = (backendString) => {
        return backendString && backendString.toLowerCase().includes('s3');
    };

    // Helper function to check if backend is Nucleus
    const isNucleusBackend = (backendString) => {
        return backendString && backendString.toLowerCase().includes('omniverse://');
    };

    // Get backend info from HeaderIcons component
    const [backend, setBackend] = useState(null);

    // Get current server from URL params
    const [currentServer, setCurrentServer] = useState(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const serverParam = urlParams.get('server');
        const currentServer = serverParam && SERVER_MAPPING[serverParam] ? serverParam : null;
        if (currentServer) {
            return currentServer;
        }
        else {
            // [v2] 用 getDefaultServerKey() 替代 Object.keys()[0]，保证 nucleus 优先
            return getDefaultServerKey();
        }
    });

    // Update currentServer when URL changes
    useEffect(() => {
        const handleServerChange = () => {
            const urlParams = new URLSearchParams(window.location.search);
            const serverParam = urlParams.get('server');
            setCurrentServer(serverParam && SERVER_MAPPING[serverParam] ? serverParam : null);
        };

        window.addEventListener('server-changed', handleServerChange);
        return () => {
            window.removeEventListener('server-changed', handleServerChange);
        };
    }, []);

    const fetchBackendInfo = async () => {
        try {
            const headers = { "Content-Type": "application/json" };
            if (auth.api_key) {
                headers["x-api-key"] = auth.api_key;
            } else if (auth.username) {
                headers["Authorization"] = `Basic ${btoa(`${auth.username}:${auth.password || ""}`)}`;
            }
            
            // Add storage backend header if a server is selected
            if (currentServer) {
                headers["x-usdsearch-storage-backend"] = currentServer;
            }
            
            const fullUrl = defaultApiUrl ? `${defaultApiUrl}/info/backend/storage` : `/info/backend/storage`;
            const response = await fetch(fullUrl, { method: 'GET', headers: headers });

            if (response.ok) {
                const data = await response.json();
                if (data.backends && Object.keys(data.backends).length > 0) {
                    const backendInfo = Object.keys(data.backends).join(', ');
                    setBackend(backendInfo);
                }
            }
        } catch (error) {
            console.error("Error fetching backend info:", error);
        }
    };

    // Fetch backend info when component mounts or server changes
    React.useEffect(() => {
        fetchBackendInfo();
    }, [auth.api_key, auth.username, auth.password, currentServer]);

    // Set default username based on backend type when server changes or backend info updates
    const setDefaultUsername = () => {
        // console.log("currentServer", currentServer);
        if (backend) {
            // Don't auto-fill if user explicitly cleared credentials for this server
            const authCleared = localStorage.getItem(getServerStorageKey("auth_cleared"));
            if (authCleared === "true") {
                return;
            }
            
            // Check if we have a server-specific username stored (null means never set)
            const serverUsername = localStorage.getItem(getServerStorageKey("username"));
            if (serverUsername === null) {
                // Store the current auth state to check if we need to update
                const currentAuth = auth;
                let newUsername = null;
                let newPassword = null;

                // [v2 安全修复] 移除原 Nucleus 分支自动注入的硬编码 admin JWT token (sub='calvingu')
                //   原行为：探测到 Nucleus backend 后，自动写入 username='$omni-api-token' +
                //          硬编码 admin password 进 localStorage，导致：
                //          ① 安全风险：任意访问者被静默赋予 admin 身份
                //          ② UX 回归：useAuthGuard 误判已登录 → DeviceFlow Modal 自动关闭
                //          ③ "已通过 Nucleus 认证"假状态显示
                //   新行为：Nucleus backend 不做任何 auto-fill，让 DeviceFlow（设备码登录）作为唯一入口
                //   保留 S3 分支：S3 backend 仍走 dummy 占位（仅测试场景，无安全风险）
                if (isS3Backend(backend)) {
                    newUsername = '';
                    newPassword = 'dummy';
                }

                // Only update if we have a new username and it's different from current
                if (newUsername !== null && newUsername !== currentAuth.username) {
                    setAuth(prevAuth => ({ ...prevAuth, username: newUsername }));
                    localStorage.setItem(getServerStorageKey("username"), newUsername);
                }
                if (newPassword !== null && newPassword !== currentAuth.password) {
                    setAuth(prevAuth => ({ ...prevAuth, password: newPassword }));
                    localStorage.setItem(getServerStorageKey("password"), newPassword);
                }
            }
        }
    }

    React.useEffect(() => {
        setDefaultUsername()
    }, [backend]);

    const handleSave = () => {
        // Save to localStorage with server-specific keys
        localStorage.setItem(getServerStorageKey("api_key"), auth.api_key || "");
        localStorage.setItem(getServerStorageKey("username"), auth.username || "");
        localStorage.setItem(getServerStorageKey("password"), auth.password || "");
        // Clear the auth_cleared flag since user is re-saving credentials
        localStorage.removeItem(getServerStorageKey("auth_cleared"));
        
        // Trigger storage event for other components
        const storageEvent = new StorageEvent('storage', {
            key: 'auth_updated',
            newValue: Date.now().toString()
        });
        window.dispatchEvent(storageEvent);
        
        // Also trigger a custom event for immediate update
        window.dispatchEvent(new CustomEvent('auth-updated'));
    };

    const handleClear = () => {
        // === LM CUSTOMIZATION: 使用统一的用户主动清除工具函数（写 auth_cleared=true） ===
        clearAuthByUserAction(selectedServer);
        setAuth({
            api_key: "",
            username: "",
            password: "",
        });
    };

    // Start Nucleus device flow authentication
    const handleStartDeviceFlow = async () => {
        if (!backend) {
            toast({
                title: t('noServerDetected'),
                description: t('waitForBackend'),
                status: "warning",
                duration: 3000,
            });
            return;
        }
        
        onDeviceFlowOpen();
        
        try {
            const result = await deviceFlowAuth.startAuth(backend);
            // Start polling for token
            deviceFlowAuth.startPolling(backend, result.device_code, result.interval);
        } catch (error) {
            toast({
                title: t('failedToStartAuth'),
                description: error.message,
                status: "error",
                duration: 5000,
            });
        }
    };

    // Handle device flow errors (保留，供 fallback 场景使用)
    useEffect(() => {
        if (deviceFlowAuth.error) {
            toast({
                title: t('authFailed'),
                description: deviceFlowAuth.error,
                status: "error",
                duration: 5000,
            });
        }
    }, [deviceFlowAuth.error]);

    // === LM CUSTOMIZATION: DeviceFlowFallback START ===
    // 原因：本地开发兜底登录路径——Device Flow 拿到 access_token 后，需要走和 SSO 完全
    //       一致的后续流程：createApiToken（永久 API token）→ persistSSOLogin → 关闭 Modal
    //       → 触发 auth-completed 事件，让 useAuthGuard 重放被拦截的请求。
    // 与 SSO processToken 行为对齐，仅入口不同（Device Flow vs SSO 弹窗）。
    // 合入英伟达新版时：移除整个 effect（NVIDIA 原版仅在 Modal 内显示成功，不做 createApiToken）。
    const deviceFlowProcessedRef = useRef(false);
    useEffect(() => {
        const accessToken = deviceFlowAuth.authResult && deviceFlowAuth.authResult.access_token;
        if (!accessToken || deviceFlowProcessedRef.current) return;
        deviceFlowProcessedRef.current = true;

        (async () => {
            try {
                const tokenName = `web-client-${Date.now()}`;
                const serverArg = backend || selectedServer;
                const apiTokenHost = resolveNucleusHost(serverArg) || serverArg;

                let effectiveApiToken;
                let isFallbackToken = false;
                try {
                    const apiTokenResult = await createApiToken(
                        apiTokenHost,
                        accessToken,
                        tokenName,
                        null // 永不过期
                    );
                    effectiveApiToken = apiTokenResult.api_token;
                } catch (apiTokenError) {
                    const isLocalDev = typeof window !== 'undefined' && (
                        window.location.hostname === 'localhost' ||
                        window.location.hostname === '127.0.0.1'
                    );
                    if (!isLocalDev) throw apiTokenError;
                    // 本地开发降级：JWT 顶替永久 token
                    console.warn('[DeviceFlow] createApiToken failed in local dev, fallback to JWT:', apiTokenError.message);
                    effectiveApiToken = accessToken;
                    isFallbackToken = true;
                    toast({
                        title: t('ssoLocalDevFallbackTitle') || '本地开发模式',
                        description: t('ssoLocalDevFallbackDesc') || 'Discovery 服务不可达，已使用 JWT 作为临时凭证（约 8-24 小时有效）',
                        status: 'warning',
                        duration: 8000,
                    });
                }

                const server = selectedServer || '';
                const resolvedHost = resolveNucleusHost(server) || '';
                persistSSOLogin(server, accessToken, effectiveApiToken, resolvedHost);

                const newAuth = {
                    ...auth,
                    username: '$omni-api-token',
                    password: effectiveApiToken,
                };
                setAuth(newAuth);

                onDeviceFlowClose();
                window.dispatchEvent(new CustomEvent('auth-completed'));

                toast({
                    title: t('authSuccess') || '登录成功',
                    description: isFallbackToken
                        ? (t('ssoLocalDevFallbackDesc') || '已使用 JWT 作为临时凭证')
                        : (t('ssoLoginSuccessDesc') || '已创建永久 API Token'),
                    status: 'success',
                    duration: 4000,
                });
            } catch (err) {
                deviceFlowProcessedRef.current = false; // 允许重试
                console.error('[DeviceFlow] post-token processing failed:', err);
                toast({
                    title: t('authFailed') || '登录失败',
                    description: err.message || String(err),
                    status: 'error',
                    duration: 6000,
                });
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deviceFlowAuth.authResult]);
    // === LM CUSTOMIZATION: DeviceFlowFallback END ===

    // === SSO 弹窗登录逻辑 ===
    // === LM CUSTOMIZATION: SSOLogin START ===
    // 简化版：对齐 demo (lightart-dev.woa.com/usdsearch) 的极简实现 —
    //   仅 localStorage 轮询（500ms）等待运维侧反向代理回写 omni_access_token，
    //   拿到后关闭弹窗 + createApiToken 换永久凭证（本地降级 JWT）。
    //   不再使用 postMessage bridge，避免跨域 source/origin 复杂度。
    // 合入英伟达新版时：整块逻辑可整体替换为 NVIDIA 原版认证机制。
    const [ssoLoading, setSsoLoading] = useState(false);
    const [ssoError, setSsoError] = useState(null);
    const ssoPollingRef = useRef(null);
    const ssoWindowRef = useRef(null);

    // 清理 SSO 轮询
    const cleanupSSOPolling = useCallback(() => {
        if (ssoPollingRef.current) {
            clearInterval(ssoPollingRef.current);
            ssoPollingRef.current = null;
        }
    }, []);
    // === LM CUSTOMIZATION: SSOLogin END ===

    // SSO 登录流程
    // === LM CUSTOMIZATION: SSOLogin START ===
    // demo 极简版（参考 usdsearch-explorer/index.html）：
    //   1) window.open SSO_LOGIN_URL
    //   2) 500ms 轮询 localStorage.omni_access_token
    //   3) 拿到 → close + createApiToken 换凭证（本地降级 JWT）
    //   4) 用户手关弹窗 → 静默退出 loading
    const handleSSOLogin = useCallback(async () => {
        setSsoError(null);
        setSsoLoading(true);

        const ssoLoginUrl = AUTH_CONFIG.SSO_LOGIN_URL || '/omni/auth/login';
        const ssoWindow = window.open(ssoLoginUrl, 'sso_login', 'width=500,height=600');
        ssoWindowRef.current = ssoWindow;

        if (!ssoWindow) {
            setSsoError(t('ssoPopupBlocked') || t('popupBlocked') || '弹窗被浏览器拦截，请允许弹窗后重试');
            setSsoLoading(false);
            return;
        }

        // 一次性锁：避免轮询拿到 token 后正在 await createApiToken 期间下一轮 tick 重复触发
        let fired = false;
        const processToken = async (token) => {
            if (fired) return;
            fired = true;
            cleanupSSOPolling();

            // 关闭弹窗
            if (ssoWindow && !ssoWindow.closed) {
                try { ssoWindow.close(); } catch (e) { /* ignore */ }
            }

            try {
                if (AUTH_CONFIG.SSO_DEBUG) {
                    // eslint-disable-next-line no-console
                    console.log('[SSO]', 'processing token from localStorage');
                }
                // 用 JWT 创建永久 API Token
                toast({
                    title: t('creatingApiToken') || '正在创建 API 令牌...',
                    description: t('pleaseWaitApiToken') || '请稍候，正在创建永久 API 令牌',
                    status: "info",
                    duration: 3000,
                });

                const now = new Date();
                const timestamp = `${now.toISOString().split('T')[0]}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
                const tokenName = `USD-Search-SSO-${timestamp}`;

                // === LM CUSTOMIZATION: SSO API Token host 解析 + 本地降级 START ===
                // 原因 1：createApiToken 内部走 normalizeServerUrl（仅剥 omniverse:// 前缀，
                //         不查 SERVER_MAPPING），若直接传 server key（如 "nucleus"）会被
                //         原样丢给 DiscoverySearch → wss://nucleus/... → 报
                //         "Failed to connect to the discovery service: nucleus"。
                //         先用 resolveNucleusHost 把 key → 真实 host。
                // 原因 2：本地开发 (localhost) 直连远程 Nucleus discovery（端口 3333 等）
                //         会被公司 OA SSO 拦截重定向 → CORS 拒绝 → 永久 token 创建失败。
                //         此时降级使用 JWT 顶替（短期可用 ~8-24h），供 fetch / Tag WebSocket
                //         调用使用，本地联调不再被卡住。
                // 合入英伟达新版时：本块独立可移除（NVIDIA 原版无 SSO 弹窗 + key 别名机制）。
                const serverArg = backend || selectedServer;
                const apiTokenHost = resolveNucleusHost(serverArg) || serverArg;
                if (AUTH_CONFIG.SSO_DEBUG) {
                    // eslint-disable-next-line no-console
                    console.log('[SSO]', 'createApiToken host resolved:', { serverArg, apiTokenHost });
                }

                let effectiveApiToken;
                let isFallbackToken = false;
                try {
                    const apiTokenResult = await createApiToken(
                        apiTokenHost,
                        token,
                        tokenName,
                        null // null = 永不过期
                    );
                    effectiveApiToken = apiTokenResult.api_token;
                } catch (apiTokenError) {
                    // 仅在本地开发场景下降级；生产环境（部署域名）失败仍报错以暴露真实问题
                    const isLocalDev = typeof window !== 'undefined' && (
                        window.location.hostname === 'localhost' ||
                        window.location.hostname === '127.0.0.1'
                    );
                    if (!isLocalDev) {
                        throw apiTokenError;
                    }
                    // 本地开发：用 JWT 顶替永久 token，给用户明确提示
                    console.warn('[SSO] createApiToken failed in local dev, falling back to JWT:', apiTokenError.message);
                    effectiveApiToken = token;
                    isFallbackToken = true;
                    toast({
                        title: t('ssoLocalDevFallbackTitle') || '本地开发模式',
                        description: t('ssoLocalDevFallbackDesc') || 'Discovery 服务不可达，已使用 JWT 作为临时凭证（约 8-24 小时有效）',
                        status: 'warning',
                        duration: 8000,
                    });
                }

                // 持久化所有 token
                const server = selectedServer || '';
                const resolvedHost = resolveNucleusHost(server) || '';
                persistSSOLogin(server, token, effectiveApiToken, resolvedHost);
                // === LM CUSTOMIZATION: SSO API Token host 解析 + 本地降级 END ===

                // 更新组件 auth state
                const newAuth = {
                    ...auth,
                    username: '$omni-api-token',
                    password: effectiveApiToken,
                };
                setAuth(newAuth);

                // 解码 JWT 获取用户名
                let username = 'user';
                try {
                    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                    username = payload.sub || 'user';
                } catch (e) { /* ignore */ }

                toast({
                    title: t('authSuccessful') || '认证成功！',
                    description: isFallbackToken
                        ? (t('createdJwtToken', { username }) || `已为 ${username} 登录（本地开发使用临时 JWT 凭证）。`)
                        : (t('createdApiToken', { username }) || `已为 ${username} 创建永久 API 令牌。`),
                    status: "success",
                    duration: 5000,
                });
            } catch (error) {
                console.error('[SSO] Failed to create API token:', error);
                setSsoError(error.message || t('failedCreateApiToken') || '创建 API Token 失败，请重试');
                toast({
                    title: t('failedCreateApiToken') || '创建 API Token 失败',
                    description: error.message || t('unknownApiTokenError') || '未知错误',
                    status: "error",
                    duration: 8000,
                });
            } finally {
                setSsoLoading(false);
            }
        };

        // === LM CUSTOMIZATION: SSO timeout + dev env hint START ===
        // 原因：
        //  1. dev 环境（localhost:3000）下，弹窗 cookie 写在 market 域，
        //     localhost 主页因同源策略读不到 → getSSOToken() 永远返回 null →
        //     轮询永远不会命中 → loading 状态会一直转。这是浏览器物理限制，
        //     不是代码 bug，但用户视角很容易误以为是 bug。
        //  2. 即便在生产域，如果用户中途关掉 SAML 流程或网络异常，也需要
        //     有总体超时保护，避免 setSsoLoading(true) 永远不被复位。
        //
        // 修复策略：
        //  A. 60s 总超时（safety net）：拿不到 token 就退出 loading + Toast 提示
        //  B. dev 环境额外提示：3s 后还在 loading 就 Toast 解释这是预期行为，
        //     建议部署到 staging 验证
        //
        // 参考侦察：docs/SSO侦察/plan-A-spec.md § 2.6 边界场景"后端没改完"
        // 合入英伟达新版时：本块整体可移除（NVIDIA 原版无 IOA SAML 流程）。
        const isLocalDev = typeof window !== 'undefined' && (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1'
        );

        // dev 环境 3s 自动提示（5s 内若未拿到 token，弹 Toast 解释跨域限制）
        let devHintTimer = null;
        if (isLocalDev) {
            devHintTimer = setTimeout(() => {
                if (fired) return;
                if (AUTH_CONFIG.SSO_DEBUG) {
                    // eslint-disable-next-line no-console
                    console.warn(
                        '[SSO]',
                        'dev env detected: market-domain cookies are unreadable from localhost ' +
                        'due to same-origin policy. The popup will not auto-close on dev. ' +
                        'Deploy to market.lightart-dev.woa.com staging for full SSO validation.'
                    );
                }
                toast({
                    title: t('ssoDevEnvHintTitle') || '本地开发环境提示',
                    description: t('ssoDevEnvHintDesc') ||
                        '完整 SSO 闭环依赖同域 cookie，localhost 跨域读不到 market 域 cookie，弹窗不会自动关闭。请部署到 staging 验证完整流程。',
                    status: 'info',
                    duration: 10000,
                    isClosable: true,
                });
            }, 3000);
        }

        // 总超时保护（60s）：避免 loading 永远转
        const ssoTimeoutTimer = setTimeout(() => {
            if (fired) return;
            cleanupSSOPolling();
            setSsoLoading(false);
            if (devHintTimer) clearTimeout(devHintTimer);
            // 只有弹窗还活着才提示用户去关，否则视为已关
            if (ssoWindow && !ssoWindow.closed) {
                try { ssoWindow.close(); } catch (e) { /* ignore */ }
            }
            setSsoError(t('ssoTimeout') || '登录超时，请重试');
            toast({
                title: t('ssoTimeout') || '登录超时',
                description: t('ssoTimeoutLong') || '登录耗时过长，请关闭弹窗后重试',
                status: 'warning',
                duration: 8000,
            });
        }, 60000);
        // === LM CUSTOMIZATION: SSO timeout + dev env hint END ===

        // 500ms 轮询 localStorage（demo 同款）
        ssoPollingRef.current = setInterval(() => {
            const token = getSSOToken();

            // 用户手关弹窗：静默退出
            if (ssoWindow.closed && !token) {
                if (fired) return;
                cleanupSSOPolling();
                clearTimeout(ssoTimeoutTimer);
                if (devHintTimer) clearTimeout(devHintTimer);
                setSsoLoading(false);
                if (AUTH_CONFIG.SSO_DEBUG) {
                    // eslint-disable-next-line no-console
                    console.log('[SSO]', 'popup closed by user before token arrival',
                        isLocalDev ? '(dev env: this is expected — see ssoDevEnvHint toast)' : '');
                }
                return;
            }

            if (token) {
                clearTimeout(ssoTimeoutTimer);
                if (devHintTimer) clearTimeout(devHintTimer);
                processToken(token);
            }
        }, 500);
    }, [backend, selectedServer, auth, setAuth, toast, t, cleanupSSOPolling]);
    // === LM CUSTOMIZATION: SSOLogin END ===

    // === LM CUSTOMIZATION: 监听 auth-auto-device-flow 事件，自动启动 SSO 登录 ===
    // useAuthGuard 检测到无 token 时会派发此事件，改造后触发 SSO 弹窗
    const ssoAutoTriggeredRef = useRef(false);
    useEffect(() => {
        const handleAutoAuth = () => {
            if (ssoAutoTriggeredRef.current) return;
            // 已认证则忽略
            if (auth?.password || auth?.api_key) return;
            ssoAutoTriggeredRef.current = true;
            // 延迟触发避免页面还没完全渲染
            setTimeout(() => {
                handleSSOLogin();
            }, 300);
        };
        window.addEventListener('auth-auto-device-flow', handleAutoAuth);
        return () => window.removeEventListener('auth-auto-device-flow', handleAutoAuth);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth, handleSSOLogin]);

    // SSO 登录认证后重置自动触发标记
    useEffect(() => {
        if (auth?.password) {
            ssoAutoTriggeredRef.current = false;
        }
    }, [auth]);

    // 组件卸载时清理
    useEffect(() => {
        return () => {
            cleanupSSOPolling();
        };
    }, [cleanupSSOPolling]);

    // === LM CUSTOMIZATION: SSOLogin UI helpers START ===
    // 从 JWT (omni_access_token) 解码出用户名（sub），用于已登录态展示真实身份。
    // 失败时回退 'user'，与 demo (lightart-dev.woa.com/usdsearch) 行为一致。
    const ssoUsername = useMemo(() => {
        if (!auth.password) return null;
        try {
            const jwt = localStorage.getItem('omni_access_token');
            if (!jwt) return null;
            const payload = JSON.parse(
                atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
            );
            return payload.sub || null;
        } catch (_e) {
            return null;
        }
    }, [auth.password]);

    const isLocalDev = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
    );
    // === LM CUSTOMIZATION: SSOLogin UI helpers END ===

    return (
        <>
        {/* === LM CUSTOMIZATION: SSOLoginCard START === */}
        {/* 登录卡片 UI（极简加强版）：使用 LA 品牌令牌（金色 #FFD230）替代硬编码。
            已登录态：绿点 + ✓ + 用户名 · 服务器；未登录态：金色主按钮 + 本地 OR 分隔线 + Device Flow 次按钮。
            合入英伟达新版时：本块可整体移除或保留，不依赖 NVIDIA 原始 UI 结构。 */}
        <VStack spacing={4} align="stretch">
            {auth.password ? (
                /* === 已登录状态 === */
                <VStack align="stretch" spacing={3}>
                    <HStack spacing={2} align="center">
                        <Box
                            w={2}
                            h={2}
                            bg={LA.success}
                            borderRadius="full"
                            boxShadow={`0 0 8px ${LA.success}`}
                        />
                        <Text fontSize="sm" color={LA.success} fontWeight="semibold">
                            {t('authenticatedWithNucleus') || '✓ 已通过 Nucleus 认证'}
                        </Text>
                    </HStack>
                    {(ssoUsername || selectedServer) && (
                        <Text
                            fontSize="xs"
                            color={LA.textMuted}
                            pl={4}
                            letterSpacing="0.02em"
                            noOfLines={1}
                            title={`${ssoUsername || ''}${ssoUsername && selectedServer ? ' · ' : ''}${selectedServer || ''}`}
                        >
                            {ssoUsername && (
                                <Box as="span" color={LA.textSecondary} fontWeight="medium">
                                    {ssoUsername}
                                </Box>
                            )}
                            {ssoUsername && selectedServer && (
                                <Box as="span" mx={1.5} opacity={0.5}>·</Box>
                            )}
                            {selectedServer}
                        </Text>
                    )}
                    <Button
                        size="sm"
                        variant="outline"
                        borderColor={LA.border}
                        color={LA.textMuted}
                        _hover={{ borderColor: LA.danger, color: LA.danger, bg: 'transparent' }}
                        onClick={() => {
                            const server = selectedServer || '';
                            const resolvedHost = resolveNucleusHost(server) || '';
                            clearSSOLogin(server, resolvedHost);
                            setAuth({
                                api_key: "",
                                username: "",
                                password: "",
                            });
                        }}
                    >
                        {t('clearToken') || '退出登录'}
                    </Button>
                </VStack>
            ) : (
                /* === 未登录状态：SSO 登录按钮 === */
                <VStack spacing={3} align="stretch">
                    <Button
                        size="md"
                        bg={LA.primary}
                        color="black"
                        _hover={{
                            bg: LA.primaryHover,
                            transform: 'translateY(-1px)',
                            boxShadow: `0 6px 16px ${LA.primaryDim}`,
                        }}
                        _active={{ bg: LA.primaryHover, transform: 'translateY(0)' }}
                        _focusVisible={{ boxShadow: `0 0 0 3px ${LA.primaryDim}` }}
                        transition="transform 0.15s ease, box-shadow 0.2s ease, background 0.15s ease"
                        width="100%"
                        onClick={handleSSOLogin}
                        isLoading={ssoLoading}
                        loadingText={t('ssoLoggingIn') || '登录中…'}
                        leftIcon={<UnlockIcon />}
                        fontWeight="bold"
                        letterSpacing="0.02em"
                        borderRadius="md"
                        py={5}
                    >
                        {t('ssoLoginButton') || 'Log in with SSO'}
                    </Button>

                    {/* === LM CUSTOMIZATION: SSOLoginHint START === */}
                    {/* 原因：SSO 在浏览器已登录 IOA 时弹窗一闪而过，新用户视觉上易困惑；
                              加一行小字说明这是预期行为。
                       合入英伟达新版时：本块可整体移除（NVIDIA 原版无 IOA SSO 流程）。 */}
                    <Text
                        fontSize="11px"
                        color={LA.textMuted}
                        textAlign="center"
                        lineHeight="1.5"
                        px={2}
                        mt={-1}
                    >
                        {t('ssoLoginHint') || '首次登录会跳转 IOA 授权；已登录的浏览器将自动通过'}
                    </Text>
                    {/* === LM CUSTOMIZATION: SSOLoginHint END === */}

                    {/* === LM CUSTOMIZATION: DeviceFlowFallback START === */}
                    {/* 原因：SSO 弹窗依赖与登录页同主域；本地开发 (localhost) 跨域 localStorage
                              隔离导致 SSO 不可用。给本地开发提供 Device Flow 兜底入口，
                              连接当前 backend (例如 ov.qq.com)，与原 NVIDIA 设备码登录路径一致。
                       生产域 (market.lightart-dev.woa.com) 与 SSO 同主域，无需此入口，自动隐藏。
                       合入英伟达新版时：本块可整体移除（NVIDIA 原版默认即 Device Flow） */}
                    {isLocalDev && (
                        <>
                            <HStack spacing={3} align="center" py={1}>
                                <Box flex="1" h="1px" bg={LA.border} opacity={0.6} />
                                <Text
                                    fontSize="10px"
                                    color={LA.textMuted}
                                    fontWeight="bold"
                                    letterSpacing="0.15em"
                                    textTransform="uppercase"
                                >
                                    {t('orDivider') || 'OR'}
                                </Text>
                                <Box flex="1" h="1px" bg={LA.border} opacity={0.6} />
                            </HStack>
                            <Button
                                size="sm"
                                variant="outline"
                                borderColor={LA.border}
                                color={LA.textSecondary}
                                _hover={{
                                    borderColor: LA.primary,
                                    color: LA.primary,
                                    bg: LA.primaryDim,
                                }}
                                _focusVisible={{ boxShadow: `0 0 0 2px ${LA.primaryDim}` }}
                                transition="all 0.15s ease"
                                onClick={handleStartDeviceFlow}
                                isLoading={deviceFlowAuth.isLoading}
                                loadingText={t('connectingToNucleus') || '正在连接 Nucleus 服务器...'}
                                isDisabled={ssoLoading}
                                aria-label={t('useDeviceFlowFallback') || '使用设备码登录（本地开发）'}
                                fontWeight="medium"
                            >
                                {t('useDeviceFlowFallback') || '使用设备码登录（本地开发）'}
                            </Button>
                        </>
                    )}
                    {/* === LM CUSTOMIZATION: DeviceFlowFallback END === */}

                    {ssoError && (
                        <Text fontSize="xs" color={LA.danger} textAlign="center" lineHeight="1.5">
                            {ssoError}
                        </Text>
                    )}

                    {ssoLoading && (
                        <HStack justify="center" spacing={2} pt={1}>
                            <Box
                                as="span"
                                w={2}
                                h={2}
                                bg={LA.primary}
                                borderRadius="full"
                                animation="pulse 1.5s ease-in-out infinite"
                            />
                            <Text fontSize="xs" color={LA.textMuted}>
                                {t('ssoWaitingAuth') || '等待 SSO 认证完成...'}
                            </Text>
                        </HStack>
                    )}
                </VStack>
            )}
        </VStack>
        {/* === LM CUSTOMIZATION: SSOLoginCard END === */}

        {/* === LM CUSTOMIZATION: DeviceFlowFallback Modal START === */}
        {/* 原因：仅在本地开发使用的兜底登录 Modal——显示 verification_uri / user_code，
                 让用户复制 → 跳转 → 粘贴 → 完成，沿用 NVIDIA 原 Device Flow 流程。
           合入英伟达新版时：可保留（NVIDIA 原版本身有此 Modal）；冲突时以本块为准。 */}
        <Modal isOpen={isDeviceFlowOpen} onClose={onDeviceFlowClose} isCentered size="md">
            <ModalOverlay backdropFilter="blur(2px)" />
            <ModalContent>
                <ModalHeader>{t('deviceFlowTitle') || 'Nucleus 设备码登录'}</ModalHeader>
                <ModalCloseButton aria-label={t('close') || '关闭'} />
                <ModalBody>
                    {deviceFlowAuth.isLoading && (
                        <Text fontSize="sm" color="gray.500">
                            {t('connectingToNucleus') || '正在连接 Nucleus 服务器...'}
                        </Text>
                    )}
                    {deviceFlowAuth.deviceFlowData && (
                        <VStack align="stretch" spacing={4}>
                            <Text fontSize="sm">
                                {t('deviceFlowStep1') || '1. 在浏览器中打开下方链接：'}
                            </Text>
                            {/* === LM CUSTOMIZATION: DeviceFlowURLRewrite START === */}
                            {/* 原因：Nucleus discovery 服务在某些部署下会返回带通配符的
                                       verification_uri（如 http://*:3180/device）
                                       —— 因为它不知道自己对外暴露的 host。
                                       NVIDIA 原版做了 URL 重写：当 URI 含端口号时，
                                       回退使用 https://{backend}/omni/auth/login/device。
                               合入英伟达新版时：保留此重写逻辑（NVIDIA 原版同款行为）。 */}
                            {(() => {
                                const uri = deviceFlowAuth.deviceFlowData.verification_uri;
                                let displayUrl = uri || (backend ? getServerHttpsUrl(backend) : '');
                                if (uri && /:\d+/.test(uri) && backend) {
                                    const serverHost = getServerHttpsUrl(backend).replace(/^https?:\/\//, '').split('/')[0];
                                    displayUrl = `https://${serverHost}/omni/auth/login/device`;
                                }
                                return (
                                    <Link
                                        href={displayUrl}
                                        isExternal
                                        color="#FFD230"
                                        fontWeight="semibold"
                                        wordBreak="break-all"
                                    >
                                        {displayUrl} <ExternalLinkIcon mx={1} />
                                    </Link>
                                );
                            })()}
                            {/* === LM CUSTOMIZATION: DeviceFlowURLRewrite END === */}
                            <Text fontSize="sm">
                                {t('deviceFlowStep2') || '2. 输入以下设备码：'}
                            </Text>
                            <HStack spacing={2}>
                                <Box
                                    flex="1"
                                    bg="gray.700"
                                    color="#FFD230"
                                    px={4}
                                    py={3}
                                    borderRadius="md"
                                    fontFamily="mono"
                                    fontSize="2xl"
                                    fontWeight="bold"
                                    textAlign="center"
                                    letterSpacing="widest"
                                    userSelect="all"
                                >
                                    {deviceFlowAuth.deviceFlowData.user_code}
                                </Box>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        navigator.clipboard.writeText(deviceFlowAuth.deviceFlowData.user_code);
                                        toast({
                                            title: t('copied') || '已复制',
                                            status: 'success',
                                            duration: 1500,
                                        });
                                    }}
                                    aria-label={t('copyCode') || '复制设备码'}
                                >
                                    {t('copy') || '复制'}
                                </Button>
                            </HStack>
                            <Text fontSize="xs" color="gray.500">
                                {t('deviceFlowStep3') || '3. 在浏览器中完成登录后，本窗口会自动关闭。'}
                            </Text>
                            {deviceFlowAuth.isPolling && (
                                <HStack spacing={2} justify="center">
                                    <Box
                                        as="span"
                                        w={2}
                                        h={2}
                                        bg="#FFD230"
                                        borderRadius="full"
                                        animation="pulse 1.5s ease-in-out infinite"
                                    />
                                    <Text fontSize="xs" color="gray.400">
                                        {t('waitingForLogin') || '等待用户授权...'}
                                    </Text>
                                </HStack>
                            )}
                            <Text fontSize="xs" color="gray.500" textAlign="center">
                                {(t('codeExpiresIn') || '代码将在 {minutes} 分钟后过期').replace(
                                    '{minutes}',
                                    String(Math.floor((deviceFlowAuth.deviceFlowData.expires_in || 900) / 60))
                                )}
                            </Text>
                        </VStack>
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button variant="ghost" size="sm" onClick={onDeviceFlowClose}>
                        {t('cancel') || '取消'}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
        {/* === LM CUSTOMIZATION: DeviceFlowFallback Modal END === */}
        </>
    );
};

// Header Icons Component
const HeaderIcons = () => {
    const { t } = useTranslation();
    const toast = useToast();

    // Server selection state
    const [selectedServer, setSelectedServer] = useState(() => {
        // Check URL for server parameter first
        const urlParams = new URLSearchParams(window.location.search);
        const serverParam = urlParams.get('server');
        
        // If server is in URL and exists in mapping, use it
        if (serverParam && SERVER_MAPPING[serverParam]) {
            return serverParam;
        }
        
        // [v2] 用 getDefaultServerKey() 替代 Object.keys()[0]，让 HeaderIcons / AuthForm / HybridDeepSearchUI 三处选同一 key（避免撕裂）
        return getDefaultServerKey();
    });

    // Helper function to get server-specific storage key
    const getServerStorageKey = (key) => {
        if (!selectedServer) return key;
        return `${selectedServer}_${key}`;
    };

    const [auth, setAuth] = useState({
        api_key: localStorage.getItem(getServerStorageKey("api_key")) || "",
        username: localStorage.getItem(getServerStorageKey("username")) || "",
        password: localStorage.getItem(getServerStorageKey("password")) || "",
    });
    const [apiUrl, setApiUrl] = useState(() => {
        // Use server-specific apiUrl if available, otherwise fall back to default
        return selectedServer && SERVER_MAPPING[selectedServer]?.apiUrl || defaultApiUrl;
    });
    const [embeddingConfig, setEmbeddingConfig] = useState(() => {
        return selectedServer && SERVER_MAPPING[selectedServer]?.embedding_config || defaultEmbeddingConfig;
    });

    // Handle server change
    const handleServerChange = (serverName) => {
        setSelectedServer(serverName);
        
        // Get the new embedding config from the server configuration
        const newEmbeddingConfig = SERVER_MAPPING[serverName]?.embedding_config || defaultEmbeddingConfig;
        setEmbeddingConfig(newEmbeddingConfig);
        
        // // Update apiUrl for the new server
        // setApiUrl(SERVER_MAPPING[serverName]?.apiUrl || defaultApiUrl);
        
        // Load server-specific auth
        const newAuth = {
            api_key: localStorage.getItem(`${serverName}_api_key`) || "",
            username: localStorage.getItem(`${serverName}_username`) || "",
            password: localStorage.getItem(`${serverName}_password`) || "",
        };
        setAuth(newAuth);
        
        // Update URL while preserving existing parameters
        const params = new URLSearchParams(window.location.search);
        const existingParams = {};
        
        
        // Save all existing parameters
        params.forEach((value, key) => {
            existingParams[key] = value;
        });
        
        // [v2 补强 2] 写 URL 时归一化为 'nucleus' 主 key —— 让分享链接永远干净。
        // 任何能被 resolveNucleusHost 解析到 'ov.qq.com' 的 key 都统一写 'nucleus'。
        const normalizedServer = (resolveNucleusHost(serverName) === 'ov.qq.com') ? 'nucleus' : serverName;
        existingParams.server = normalizedServer;
        
        // Reconstruct URL with all parameters
        const newParams = new URLSearchParams(existingParams);
        const url = new URL(window.location);
        url.search = newParams.toString();
        window.history.replaceState({}, '', url);
                
        // Dispatch a custom event to notify other components about the server change
        // 注意：派发 detail.server 仍用原始 serverName（保持 storage key / state 内部行为不变）
        window.dispatchEvent(new CustomEvent('server-changed', { 
            detail: { server: serverName, embeddingConfig: newEmbeddingConfig }
        }));        
    };
    
    // Use disclosure for auth popover - always starts closed
    const { isOpen: isAuthOpen, onOpen: onAuthOpen, onClose: onAuthClose, onToggle: onAuthToggle } = useDisclosure();
    // [v2 补强 4] 独立管理 server 选择 popover，让点击外部 / ESC 也能关闭
    const { isOpen: isServerOpen, onClose: onServerClose, onToggle: onServerToggle } = useDisclosure();

    // [v2 补强 / 部署修复] Server 下拉去重：按"解析后的真实 host 值"去重，而不是按对象引用。
    //
    // 历史踩坑（部署环境）：早期版本按 `seen.has(cfg)` 即对象引用去重，依赖 SERVER_MAPPING_FALLBACK
    // 三个 key 共享同一 NUCLEUS_CONFIG 引用。但 `.env.production` 的 REACT_APP_SERVER_MAPPING JSON
    // 解析后多个 key 是相互独立的对象，与 fallback 合并后引用全部不同 → 去重失效 → 下拉出现
    // 3 行 "OV.QQ.COM"。本地 dev 不加载 .env.production，纯走 fallback 共享引用，所以本地是正常的。
    //
    // 现按 host 值去重：'nucleus' / 'omniverse' / 'omniverse://ov.qq.com' 经 resolveNucleusHost
    // 全部解析到 'ov.qq.com' → Set 命中 → 仅保留排序最靠前的（'nucleus' 优先）。
    // 未来运维若在 env 配置真正不同 host 的服务器，下拉会正确显示对应数量。
    const uniqueServers = useMemo(() => {
        const seen = new Set();
        const list = [];
        let dupWarned = false;
        // 先把 'nucleus' 顶上去（如果存在），让 option[0] 永远是新主 key
        const orderedKeys = Object.keys(SERVER_MAPPING).sort((a, b) => {
            if (a === 'nucleus') return -1;
            if (b === 'nucleus') return 1;
            return 0;
        });
        for (const key of orderedKeys) {
            const cfg = SERVER_MAPPING[key];
            if (!cfg || typeof cfg !== 'object') continue;
            // 三级 fallback 选去重 key：
            //   1) resolveNucleusHost(key)  —— 最权威，能拉平 'nucleus'/'omniverse'/'omniverse://ov.qq.com' 等所有别名
            //   2) cfg.host                  —— env 富对象兜底
            //   3) cfg.name || key           —— 极端兜底，避免空字符串崩
            const dedupKey =
                resolveNucleusHost(key) ||
                (typeof cfg.host === 'string' && cfg.host.trim()) ||
                (cfg.name || key);
            if (!dedupKey) continue;
            if (seen.has(dedupKey)) {
                // 异常配置提示：同 host 但 name 不同时，提醒运维一次（不阻断渲染）
                const existing = list.find(it => (
                    (resolveNucleusHost(it.key) ||
                     (typeof SERVER_MAPPING[it.key]?.host === 'string' && SERVER_MAPPING[it.key].host.trim()) ||
                     (SERVER_MAPPING[it.key]?.name || it.key)
                    ) === dedupKey
                ));
                if (!dupWarned && existing && (cfg.name || key) !== existing.name) {
                    // eslint-disable-next-line no-console
                    console.warn(
                        `[SERVER_MAPPING] Duplicate host "${dedupKey}" with different names: ` +
                        `"${existing.name}" vs "${cfg.name || key}". Only the first is shown.`
                    );
                    dupWarned = true;
                }
                continue;
            }
            seen.add(dedupKey);
            list.push({ key, name: cfg.name || key });
        }
        return list;
    }, []);

    // 监听 AuthGuard 事件：自动打开登录弹窗
    useEffect(() => {
        const handleAuthGuardOpen = () => {
            onAuthOpen();
        };
        window.addEventListener('auth-guard-open', handleAuthGuardOpen);
        return () => window.removeEventListener('auth-guard-open', handleAuthGuardOpen);
    }, [onAuthOpen]);
        
    const [plugins, setPlugins] = useState({ active: [], inactive: [] });
    const [backend, setBackend] = useState(null);
    const [loading, setLoading] = useState(false);

    // Listen for storage changes to update auth state
    useEffect(() => {
        const handleStorageChange = () => {
            const newAuth = {
                api_key: localStorage.getItem(getServerStorageKey("api_key")) || "",
                username: localStorage.getItem(getServerStorageKey("username")) || "",
                password: localStorage.getItem(getServerStorageKey("password")) || "",
            };
            setAuth(newAuth);
        };

        const handleAuthUpdate = () => {
            handleStorageChange();
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('auth-updated', handleAuthUpdate);
        
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('auth-updated', handleAuthUpdate);
        };
    }, [onAuthClose, selectedServer]);


    const getHeaders = () => {
        const headers = { "Content-Type": "application/json" };

        // Add storage backend header if a server is selected
        if (selectedServer) {
            headers["x-usdsearch-storage-backend"] = selectedServer;
        }

        // Get server-specific auth if available
        const serverAuth = {
            api_key: localStorage.getItem(getServerStorageKey("api_key")) || "",
            username: localStorage.getItem(getServerStorageKey("username")) || "",
            password: localStorage.getItem(getServerStorageKey("password")) || "",
        };

        if (serverAuth.username && serverAuth.username.trim() !== "") {
            headers["Authorization"] = `Basic ${btoa(`${serverAuth.username}:${serverAuth.password || ""}`)}`;
        } else if (serverAuth.api_key) {
            headers["x-api-key"] = serverAuth.api_key;
        }
        
        return headers;
    };

    const fetchPluginsInfo = async (selectedServerOverride = null) => {
        try {
            setLoading(true);
            const headers = getHeaders();
            const fullUrl = defaultApiUrl ? `${defaultApiUrl}/info/plugins` : `/info/plugins`;

            const response = await fetch(fullUrl, { 
                method: 'GET',
                headers: headers 
            });

            if (response.ok) {
                const data = await response.json();

                // Handle different response formats
                if (Array.isArray(data)) {
                    // If data is just an array of plugin names
                    setPlugins({ active: data, inactive: [] });
                } else if (data.active || data.inactive) {
                    // If data has active/inactive structure
                    setPlugins(data);
                } else {
                    // If data is an object with plugin info
                    setPlugins({ active: Object.keys(data), inactive: [] });
                }
            } else {
                const errorText = await response.text();
                console.error("Failed to fetch plugins:", response.status, response.statusText, errorText);
                
                // Try without auth headers if auth failed
                if (response.status === 401 || response.status === 403) {
                    // Keep the storage backend header but remove auth headers
                    const noAuthHeaders = { 
                        "Content-Type": "application/json",
                        ...(selectedServer && { "x-usdsearch-storage-backend": selectedServerOverride ? selectedServerOverride:selectedServer })
                    };
                    const noAuthResponse = await fetch(fullUrl, {
                        method: 'GET',
                        headers: noAuthHeaders
                    });
                    if (noAuthResponse.ok) {
                        const data = await noAuthResponse.json();

                        // Handle different response formats
                        if (Array.isArray(data)) {
                            setPlugins({ active: data, inactive: [] });
                        } else if (data.active || data.inactive) {
                            setPlugins(data);
                        } else {
                            setPlugins({ active: Object.keys(data), inactive: [] });
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching plugins info:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchBackendInfo = async (selectedServerOverride = null) => {
        try {
            const headers = getHeaders();
            const fullUrl = defaultApiUrl ? `${defaultApiUrl}/info/backend/storage` : `/info/backend/storage`;

            const response = await fetch(fullUrl, { 
                method: 'GET',
                headers: headers 
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Parse the backends structure
                if (data.backends && Object.keys(data.backends).length > 0) {
                    const backendInfo = Object.entries(data.backends).map(([url, info]) => ({
                        url,
                        type: info.storage_backend_type,
                        baseUrl: info.base_url
                    }));
                    setBackend(backendInfo);
                } else {
                    setBackend(null);
                }
            } else {
                const errorText = await response.text();
                console.error("Failed to fetch backend:", response.status, response.statusText, errorText);
                
                // Try without auth headers if auth failed
                if (response.status === 401 || response.status === 403) {
                    // Keep the storage backend header but remove auth headers
                    const noAuthHeaders = { 
                        "Content-Type": "application/json",
                        ...(selectedServer && { "x-usdsearch-storage-backend": selectedServerOverride ? selectedServerOverride:selectedServer })
                    };
                    const noAuthResponse = await fetch(fullUrl, {
                        method: 'GET',
                        headers: noAuthHeaders
                    });
                    if (noAuthResponse.ok) {
                        const data = await noAuthResponse.json();
                        
                        if (data.backends && Object.keys(data.backends).length > 0) {
                            const backendInfo = Object.entries(data.backends).map(([url, info]) => ({
                                url,
                                type: info.storage_backend_type,
                                baseUrl: info.base_url
                            }));
                            setBackend(backendInfo);
                        } else {
                            setBackend(null);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching backend info:", error);
        }
    };

    useEffect(() => {
        fetchPluginsInfo();
        fetchBackendInfo();
        
        // Dispatch initial server configuration so other components get the correct initial state
        if (selectedServer && SERVER_MAPPING[selectedServer]) {
            const initialEmbeddingConfig = SERVER_MAPPING[selectedServer]?.embedding_config || defaultEmbeddingConfig;
            window.dispatchEvent(new CustomEvent('server-changed', { 
                detail: { server: selectedServer, embeddingConfig: initialEmbeddingConfig }
            }));
        }
    }, []);
    
    const { language, toggleLanguage } = useTranslation();
    
    return (
        <HStack spacing={3} alignItems="center">
            <Tooltip label={t('language')}>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={toggleLanguage}
                    color="#ABABAB"
                    _hover={{ color: "white", bg: "rgba(255,255,255,0.06)" }}
                    fontSize="xs"
                    fontWeight="600"
                    px={0}
                    minW="32px"
                    h="32px"
                    lineHeight="32px"
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                    pt="1px"
                >
                    {language === 'en' ? '中文' : 'EN'}
                </Button>
            </Tooltip>
            {Object.keys(SERVER_MAPPING).length > 0 && (
                <Popover
                    isOpen={isServerOpen}
                    onClose={onServerClose}
                    closeOnBlur={true}
                    closeOnEsc={true}
                >
                    <PopoverTrigger>
                        {/* [v2 补强 4] Box as="button" 既是 forwardRef 节点（PopoverTrigger 转发不出问题），
                            又顺带获得 a11y（键盘 Enter/Space、focus ring、aria role）。
                            原 <HStack> 仅作为内层视觉布局。 */}
                        <Box
                            as="button"
                            onClick={onServerToggle}
                            display="inline-flex"
                            bg="#FFD230"
                            px={3}
                            py={1.5}
                            borderRadius="8px"
                            cursor="pointer"
                            _hover={{ bg: "#F6C80F", boxShadow: "0 2px 8px rgba(255,210,48,0.3)" }}
                            minW="100px"
                            transition="all 0.2s"
                            border="none"
                            outline="none"
                            _focus={{ boxShadow: "0 0 0 2px rgba(255,210,48,0.5)" }}
                        >
                            <HStack spacing={2} alignItems="center" justifyContent="center" w="100%">
                                <Text 
                                    color="black" 
                                    fontSize="sm" 
                                    fontWeight="600"
                                    noOfLines={1}
                                >
                                    {SERVER_MAPPING[selectedServer]?.name || t('selectServer')}
                                </Text>
                                <ChevronDownIcon color="black" />
                            </HStack>
                        </Box>
                    </PopoverTrigger>
                    <PopoverContent width="400px">
                        <PopoverArrow />
                        <PopoverCloseButton />
                        <PopoverHeader>{t('serverConfiguration')}</PopoverHeader>
                        <PopoverBody>
                            <VStack spacing={4} align="stretch">
                                <Box>
                                    <Text fontWeight="bold" mb={2}>{t('serverSelection')}</Text>
                                    <Select
                                        size="sm"
                                        value={selectedServer}
                                        onChange={(e) => handleServerChange(e.target.value)}
                                        bg="#1C1D20"
                                        color="white"
                                        borderColor="#383838"
                                        _hover={{ borderColor: "#FFD230" }}
                                        _focus={{ borderColor: "#FFD230", boxShadow: "0 0 0 1px #FFD230" }}
                                    >
                                        {/* [v2 补强] 用 uniqueServers 去重渲染，避免出现两行空白选项 */}
                                        {uniqueServers.map(({ key, name }) => (
                                            <option key={key} value={key}>{name}</option>
                                        ))}
                                    </Select>
                                </Box>
                                
                                <Divider />
                                
                                <Box>
                                    <HStack justify="space-between" mb={2}>
                                        <Text fontWeight="bold">{t('authentication')}</Text>
                                        <HStack spacing={1}>
                                            <Text fontSize="sm" color="gray.500">{t('status')}</Text>
                                            <Text fontSize="sm" color={auth.api_key || (auth.username && auth.password) ? "#FFD230" : "#FF4D4F"}>
                                                {auth.api_key || (auth.username && auth.password) ? t('authenticated') : t('notAuthenticated')}
                                            </Text>
                                            {auth.api_key || (auth.username && auth.password) ? <LockIcon color="#FFD230" /> : <UnlockIcon color="#FF4D4F" />}
                                        </HStack>
                                    </HStack>
                                    <AuthForm auth={auth} setAuth={setAuth} getServerStorageKey={getServerStorageKey} selectedServer={selectedServer} />
                                </Box>
                            </VStack>
                        </PopoverBody>
                    </PopoverContent>
                </Popover>
            )}
            {!(Object.keys(SERVER_MAPPING).length > 0) && (
                <Popover isOpen={isAuthOpen} onClose={onAuthClose}>
                    <PopoverTrigger>
                        {(auth.api_key || auth.username) ? (
                            <IconButton
                                size="sm"
                                icon={<LockIcon />}
                                aria-label={t('authenticationStatus')}
                                variant="ghost"
                                color="#ABABAB"
                                _hover={{ color: "white", bg: "rgba(255,255,255,0.06)" }}
                                onClick={onAuthToggle}
                            />
                        ) : (
                            <Box position="relative" display="inline-flex" alignItems="center" justifyContent="center">
                                {/* Ping ripple ring — framer-motion */}
                                <motion.div
                                    style={{
                                        position: "absolute",
                                        top: "50%",
                                        left: "50%",
                                        width: 32,
                                        height: 32,
                                        marginLeft: -16,
                                        marginTop: -16,
                                        borderRadius: "50%",
                                        border: "2px solid rgba(255, 77, 79, 0.55)",
                                        pointerEvents: "none",
                                    }}
                                    animate={{
                                        scale: [0.8, 2.2],
                                        opacity: [0.7, 0],
                                    }}
                                    transition={{
                                        duration: 2,
                                        ease: "easeOut",
                                        repeat: Infinity,
                                    }}
                                />
                                <Tooltip
                                    label={t('clickToLogin')}
                                    hasArrow
                                    placement="bottom"
                                    bg="#FF4D4F"
                                    color="white"
                                >
                                    {/* Glow + wiggle wrapper — framer-motion */}
                                    <motion.div
                                        animate={{
                                            boxShadow: [
                                                "0 0 4px rgba(255,77,79,0.3), 0 0 8px rgba(255,77,79,0.1)",
                                                "0 0 14px rgba(255,77,79,0.7), 0 0 28px rgba(255,77,79,0.3)",
                                                "0 0 4px rgba(255,77,79,0.3), 0 0 8px rgba(255,77,79,0.1)",
                                            ],
                                        }}
                                        transition={{
                                            duration: 2,
                                            ease: "easeInOut",
                                            repeat: Infinity,
                                        }}
                                        style={{ borderRadius: 8, display: "inline-flex" }}
                                        whileHover={{
                                            boxShadow: "0 0 16px rgba(255,77,79,0.6)",
                                        }}
                                    >
                                        <IconButton
                                            size="sm"
                                            icon={
                                                <motion.span
                                                    style={{ display: "inline-flex" }}
                                                    animate={{
                                                        rotate: [0, -14, 12, -8, 6, -2, 0, 0, 0, 0],
                                                        scale:  [1, 1.2, 1.2, 1.15, 1.1, 1.05, 1, 1, 1, 1],
                                                    }}
                                                    transition={{
                                                        duration: 3,
                                                        ease: "easeInOut",
                                                        repeat: Infinity,
                                                    }}
                                                >
                                                    <UnlockIcon boxSize="18px" />
                                                </motion.span>
                                            }
                                            aria-label={t('clickToLogin')}
                                            variant="ghost"
                                            color="#FF4D4F"
                                            borderRadius="8px"
                                            _hover={{
                                                bg: "rgba(255,77,79,0.15)",
                                                color: "white",
                                            }}
                                            onClick={onAuthToggle}
                                        />
                                    </motion.div>
                                </Tooltip>
                                {/* Red badge dot — framer-motion */}
                                <motion.div
                                    style={{
                                        position: "absolute",
                                        top: 1,
                                        right: 1,
                                        width: 9,
                                        height: 9,
                                        background: "#FF4D4F",
                                        borderRadius: "50%",
                                        border: "1.5px solid #141517",
                                        pointerEvents: "none",
                                    }}
                                    animate={{
                                        scale: [1, 1.5, 1],
                                        opacity: [1, 0.6, 1],
                                    }}
                                    transition={{
                                        duration: 1.5,
                                        ease: "easeInOut",
                                        repeat: Infinity,
                                    }}
                                />
                            </Box>
                        )}
                    </PopoverTrigger>
                    <PopoverContent>
                        <PopoverArrow />
                        <PopoverCloseButton />
                        <PopoverHeader>{t('authenticationStatus')}</PopoverHeader>
                        <PopoverBody>
                            <AuthForm auth={auth} setAuth={setAuth} getServerStorageKey={getServerStorageKey} selectedServer={selectedServer} />
                        </PopoverBody>
                    </PopoverContent>
                </Popover>
            )}
            <Tooltip label={t('shareCurrentSearch')}>
                <IconButton
                    size="sm"
                    variant="ghost"
                    icon={<LinkIcon />}
                    onClick={() => {
                        const currentUrl = window.location.href;
                        const doCopy = () => {
                            if (navigator.clipboard?.writeText) {
                                return navigator.clipboard.writeText(currentUrl).then(
                                    () => 'success',
                                    () => { throw new Error('clipboard-api-failed'); }
                                );
                            }
                            return new Promise((resolve, reject) => {
                                const textarea = document.createElement('textarea');
                                textarea.value = currentUrl;
                                textarea.style.position = 'fixed';
                                textarea.style.left = '-9999px';
                                textarea.style.top = '-9999px';
                                textarea.setAttribute('readonly', '');
                                document.body.appendChild(textarea);
                                textarea.select();
                                try {
                                    const ok = document.execCommand('copy');
                                    document.body.removeChild(textarea);
                                    if (ok) resolve('success'); else reject(new Error('execCommand-failed'));
                                } catch (e) {
                                    document.body.removeChild(textarea);
                                    reject(e);
                                }
                            });
                        };
                        doCopy().then(() => {
                            toast({
                                title: t('copiedToClipboard'),
                                status: "success",
                                duration: 2000,
                            });
                        }).catch(() => {
                            toast({
                                title: t('copyFailed'),
                                status: "error",
                                duration: 3000,
                            });
                        });
                    }}
                    aria-label={t('shareCurrentSearch')}
                    color="#ABABAB"
                    _hover={{ color: "white", bg: "rgba(255,255,255,0.06)" }}
                />
            </Tooltip>
            <Popover>
                <PopoverTrigger>
                    <IconButton
                        size="sm"
                        icon={<InfoIcon />}
                        aria-label={t('instanceInformation')}
                        variant="ghost"
                        color="#ABABAB"
                        _hover={{ color: "white", bg: "rgba(255,255,255,0.06)" }}
                        onClick={() => { fetchPluginsInfo(); fetchBackendInfo(); }}
                    />
                </PopoverTrigger>
                <PopoverContent width="600px">
                    <PopoverArrow />
                    <PopoverHeader>
                        <HStack justify="space-between" pr={6}>
                            <Text>{t('instanceInformation')}</Text>
                            <Button size="xs" onClick={() => { fetchPluginsInfo(); fetchBackendInfo(); }}>
                                {t('refresh')}
                            </Button>
                        </HStack>
                    </PopoverHeader>
                    <PopoverCloseButton />
                    <PopoverBody>
                        <VStack spacing={4} align="stretch">
                            <Box>
                                <Text fontWeight="bold" mb={2} color="white">{t('storageBackends')}</Text>
                                {loading ? (
                                    <Text fontSize="sm" color="gray.300">{t('loading')}</Text>
                                ) : backend && Array.isArray(backend) ? (
                                    <VStack align="start" spacing={2}>
                                        {backend.map((backendItem, index) => (
                                            <Box key={index} p={2} bg="gray.700" borderRadius="md" w="100%">
                                                <Text fontSize="sm" color="white" fontWeight="medium">
                                                    {backendItem.type.toUpperCase()} {t('storage')}
                                                </Text>
                                                <Text fontSize="xs" color="gray.300" mt={1}>
                                                    {backendItem.url}
                                                </Text>
                                                {backendItem.baseUrl !== backendItem.url && (
                                                    <Text fontSize="xs" color="gray.400" mt={1}>
                                                        Base: {backendItem.baseUrl}
                                                    </Text>
                                                )}
                                            </Box>
                                        ))}
                                    </VStack>
                                ) : (
                                    <VStack align="start" spacing={1}>
                                        <Text fontSize="sm" color="gray.300">{t('noBackendInfo')}</Text>
                                        <Button size="xs" onClick={fetchBackendInfo}>{t('retry')}</Button>
                                    </VStack>
                                )}
                            </Box>
                            <Divider />
                            <Box>
                                <Text fontWeight="bold" mb={2} color="white">{t('supportedPlugins')}</Text>
                                {loading ? (
                                    <Text fontSize="sm" color="gray.300">{t('loading')}</Text>
                                ) : plugins && (plugins.active?.length > 0 || plugins.inactive?.length > 0) ? (
                                    <Box maxH="300px" overflowY="auto">
                                        {plugins.active && plugins.active.length > 0 && (
                                            <Box mb={3}>
                                                <Text fontWeight="semibold" color="#FFD230" mb={2}>{t('activePlugins')} ({plugins.active.length})</Text>
                                                {plugins.active.map((plugin, index) => (
                                                    <Box key={index} mb={2}>
                                                        <Text fontSize="sm" color="white" fontWeight="medium">
                                                            {plugin.name || plugin}
                                                        </Text>
                                                        {plugin.description && (
                                                            <Text fontSize="xs" color="gray.300" ml={2} mt={1}>
                                                                {plugin.description}
                                                            </Text>
                                                        )}
                                                    </Box>
                                                ))}
                                            </Box>
                                        )}
                                        {plugins.inactive && plugins.inactive.length > 0 && (
                                            <Box mb={3}>
                                                <Text fontWeight="semibold" color="gray.400" mb={2}>{t('inactivePlugins')} ({plugins.inactive.length})</Text>
                                                {plugins.inactive.map((plugin, index) => (
                                                    <Box key={index} mb={2}>
                                                        <Text fontSize="sm" color="gray.200" fontWeight="medium">
                                                            {plugin.name || plugin}
                                                        </Text>
                                                        {plugin.description && (
                                                            <Text fontSize="xs" color="gray.300" ml={2} mt={1}>
                                                                {plugin.description}
                                                            </Text>
                                                        )}
                                                    </Box>
                                                ))}
                                            </Box>
                                        )}
                                    </Box>
                                ) : (
                                    <VStack align="start" spacing={1}>
                                        <Text fontSize="sm" color="gray.300">No plugins information available</Text>
                                        <Button size="xs" onClick={fetchPluginsInfo}>Retry</Button>
                                    </VStack>
                                )}
                            </Box>
                        </VStack>
                    </PopoverBody>
                </PopoverContent>
            </Popover>
        </HStack>
    );
};

// Language Switcher Button Component
const LanguageSwitcher = () => {
    const { language, toggleLanguage, t } = useTranslation();
    return (
        <Button
            size="sm"
            variant="ghost"
            onClick={toggleLanguage}
            color="#ABABAB"
            _hover={{ color: "white", bg: "rgba(255,255,255,0.06)" }}
            fontSize="sm"
            fontWeight="500"
            px={2}
            minW="auto"
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            pt="1px"
        >
            {language === 'en' ? '中文' : 'EN'}
        </Button>
    );
};

// App wrapper to initialize persistent cache
const App = () => {
    // === LM CUSTOMIZATION: Sidebar state START ===
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    // === LM CUSTOMIZATION: Sidebar state END ===

    useEffect(() => {
        // Initialize persistent image cache on app startup
        persistentCache.init().then(supported => {
            console.log(`Persistent image cache ${supported ? 'initialized' : 'not supported'}`);
        }).catch(err => {
            console.warn('Failed to initialize persistent image cache:', err);
        });
    }, []);

    return (
        // === LM CUSTOMIZATION: Provider START ===
        <LanguageProvider>
        <ChakraProvider theme={theme}>
            {/* === LM CUSTOMIZATION: Fab-style top bar START === */}
            <Box
                w="100%"
                h="72px"
                bg="transparent"
                borderBottom="1px solid rgba(255,255,255,0.05)"
                position="sticky"
                top={0}
                zIndex={1100}
                backdropFilter="blur(12px)"
                backgroundColor="rgba(16,16,20,0.85)"
                data-drag-select-skip="true"
            >
                <Flex h="100%" alignItems="center" px={6} gap={4}>
                    {/* 左侧：仅 Logo（移除标题文字和版本号，Fab 风格） */}
                    <Image src={logo} alt="LIGHT MARKET" h="42px" filter="brightness(1.1)" flexShrink={0} cursor="pointer" onClick={() => window.location.href = '/'} />
                    
                    {/* 中间：胶囊搜索框（Fab 风格 radius 9999px） */}
                    <TopSearchBar style={{ margin: '0 auto' }} />
                    
                    {/* 右侧：功能图标（保持不变） */}
                    <HeaderIcons handleSearch={() => window.dispatchEvent(new Event('trigger-search'))} />
                </Flex>
            </Box>
            {/* === LM CUSTOMIZATION: Fab-style top bar END === */}
            <ColorModeScript initialColorMode={theme.config.initialColorMode}/>
            {/* === LM CUSTOMIZATION: Layout START === */}
            <Flex>
                <CategorySidebar
                    collapsed={sidebarCollapsed}
                    onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                />
                <Box flex="1" minW={0} ml={sidebarCollapsed ? 0 : '320px'} transition="margin-left 0.2s ease">
                    <SearchApp/>
                </Box>
            </Flex>
            {/* === LM CUSTOMIZATION: Layout END === */}
        </ChakraProvider>
        </LanguageProvider>
    );
};

const container = document.getElementById('root');
const root = ReactDOMClient.createRoot(container);
root.render(
      <App/>
);

