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

import React, {useState, useEffect, useRef, useMemo} from 'react';
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
// === LM CUSTOMIZATION: SearchSettingsTrigger START ===
// 原因：在顶栏搜索框右侧加一个齿轮 IconButton 作为"搜索设置" Popover 的触发器
//        （Popover 主体在 components/SearchSettingsPopover.jsx，挂在 HybridDeepSearchUI 内）；
//        触发器与 Popover 通过 CustomEvent('open-search-settings') 解耦。
// 合入英伟达新版时：原本就存在的 @chakra-ui/icons 解构 import 不动；
//   "搜索设置" 改用 TuneIcon（来自 components/icons/MaterialIcons.jsx 公共模块）。
import { LockIcon, UnlockIcon, InfoIcon, ExternalLinkIcon, ChevronDownIcon, LinkIcon } from '@chakra-ui/icons';
import { TuneIcon } from './components/icons/MaterialIcons';
// === LM CUSTOMIZATION: SearchSettingsTrigger END ===
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
import { apiUrl as defaultApiUrl, SERVER_MAPPING, defaultEmbeddingConfig, resolveNucleusHost, getDefaultServerKey } from "./config";
import GraphVisualization from "./Graph";
import persistentCache from "./utils/persistentImageCache";
import { useDeviceFlowAuth, getServerHttpsUrl, AuthStatus, createApiToken } from "./nucleus";
// === LM CUSTOMIZATION: Auth Guard utils ===
import { clearAuthByUserAction } from "./utils/authStorage";

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

    // === LM CUSTOMIZATION: 监听 auth-auto-device-flow 事件，自动启动 Device Flow ===
    // 流程：
    //  1) 收到事件 → 若用户已认证则忽略；否则标记 pendingAutoStart
    //  2) 若 backend 已就绪且是 Nucleus 后端 → 立即启动
    //  3) 否则等待 backend useEffect 链路探测完毕，再由下面的 effect 触发
    useEffect(() => {
        const handleAutoDeviceFlow = () => {
            if (autoStartTriggeredRef.current) return;
            // 已认证则无需重复启动
            if (auth?.password || auth?.api_key) return;
            pendingAutoStartRef.current = true;
            // 如果 backend 已就绪且是 Nucleus 后端，立即启动
            if (backend && isNucleusBackend(backend) && !isDeviceFlowOpen) {
                autoStartTriggeredRef.current = true;
                pendingAutoStartRef.current = false;
                handleStartDeviceFlow();
            }
        };
        window.addEventListener('auth-auto-device-flow', handleAutoDeviceFlow);
        return () => window.removeEventListener('auth-auto-device-flow', handleAutoDeviceFlow);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [backend, auth, isDeviceFlowOpen]);

    // 当 backend 延迟就绪后触发 pending 的自动启动
    useEffect(() => {
        if (!pendingAutoStartRef.current) return;
        if (autoStartTriggeredRef.current) return;
        if (!backend) return;
        if (!isNucleusBackend(backend)) {
            // 非 Nucleus 后端：清除 pending，不自动启动（用户手动填用户名密码）
            pendingAutoStartRef.current = false;
            return;
        }
        if (auth?.password || auth?.api_key) {
            pendingAutoStartRef.current = false;
            return;
        }
        autoStartTriggeredRef.current = true;
        pendingAutoStartRef.current = false;
        handleStartDeviceFlow();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [backend]);

    // Device Flow 成功完成 / 用户关闭 → 复位允许下次 auth-auto-device-flow 再次触发
    useEffect(() => {
        if (!isDeviceFlowOpen) {
            // Modal 关闭后等 1s 重置，避免同一流程内重复触发
            const t = setTimeout(() => {
                autoStartTriggeredRef.current = false;
            }, 1000);
            // 清除底部 toast 去重窗口
            if (typeof window !== 'undefined') window.__authGuardActiveUntil = 0;
            return () => clearTimeout(t);
        }
        // Device Flow Modal 打开时屏蔽底部 loginRequired toast（30s 窗口）
        if (typeof window !== 'undefined') {
            window.__authGuardActiveUntil = Date.now() + 30 * 1000;
        }
        return undefined;
    }, [isDeviceFlowOpen]);

    // Handle successful device flow authentication - create API token
    useEffect(() => {
        const createAndSaveApiToken = async () => {
            if (deviceFlowAuth.authResult && deviceFlowAuth.authResult.status === AuthStatus.OK) {
                try {
                    // Create a long-lived API token using the access token
                    const now = new Date();
                    const timestamp = `${now.toISOString().split('T')[0]}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
                    const tokenName = `USD-Search-${timestamp}`;
                    
                    toast({
                        title: t('creatingApiToken'),
                        description: t('pleaseWaitApiToken'),
                        status: "info",
                        duration: 3000,
                    });
                    
                    // Pass null for expireAt to create a permanent token (no expiration)
                    const apiTokenResult = await createApiToken(
                        backend, 
                        deviceFlowAuth.authResult.access_token, 
                        tokenName, 
                        null
                    );
                    
                    // Set the API token as the password with $omni-api-token username
                    const newAuth = { 
                        ...auth, 
                        username: '$omni-api-token',
                        password: apiTokenResult.api_token 
                    };
                    setAuth(newAuth);
                    
                    // Save to localStorage
                    localStorage.setItem(getServerStorageKey("username"), '$omni-api-token');
                    localStorage.setItem(getServerStorageKey("password"), apiTokenResult.api_token);
                    // [TagStorageKeyFix] Save tokens for tagging operations (API Token may lack write permissions)
                    //
                    // 双写两份 key —— 同时按 "selectedServer 原值"（兼容 AuthForm 其他读取路径）
                    // 和 "resolveNucleusHost(selectedServer) 解析后的真实 host"（匹配 taggingService 优先级）
                    // 写入。这样无论是 ?server=omniverse（原值 'omniverse' / 真实 host 'ov.qq.com'）还是
                    // ?server=https://ov.qq.com（两者相等，跳过重复写），新用户/无痕模式下都能直接命中。
                    //
                    // 三个 setItem 包在同一 try 块连续执行，任一抛错则 console.error 但不中断登录流程
                    // （token 已经写过的部分仍然有效，避免出现"有 token 没 expiry"的脏状态导致 preflight 误判）。
                    try {
                      const accessToken = deviceFlowAuth.authResult.access_token;
                      const refreshTok  = deviceFlowAuth.authResult.refresh_token;
                      const expiryStr   = String(Date.now() + 25 * 60 * 1000);

                      // 原行为：按 selectedServer 原值前缀写入
                      if (refreshTok) {
                        localStorage.setItem(getServerStorageKey("nucleus_refresh_token"), refreshTok);
                      }
                      if (accessToken) {
                        localStorage.setItem(getServerStorageKey("nucleus_access_token"), accessToken);
                        localStorage.setItem(getServerStorageKey("nucleus_access_token_expiry"), expiryStr);
                      }

                      // 新增：按真实 host 解析结果再写一份（如 'ov.qq.com_nucleus_*'），让 service 优先级查找命中
                      const aliasPrefix = (selectedServer || '').toString();
                      const hostPrefix = resolveNucleusHost(selectedServer) || '';
                      if (accessToken && hostPrefix && hostPrefix !== aliasPrefix) {
                        if (refreshTok) {
                          localStorage.setItem(`${hostPrefix}_nucleus_refresh_token`, refreshTok);
                        }
                        localStorage.setItem(`${hostPrefix}_nucleus_access_token`, accessToken);
                        localStorage.setItem(`${hostPrefix}_nucleus_access_token_expiry`, expiryStr);
                      }
                    } catch (persistErr) {
                      // 不中断登录流程：已写入的 key 仍可用，下次登录会再试一次
                      // eslint-disable-next-line no-console
                      console.error('[DeviceFlow] persist nucleus token failed', persistErr);
                    }
                    // Clear the auth_cleared flag since user just authenticated
                    localStorage.removeItem(getServerStorageKey("auth_cleared"));
                    window.dispatchEvent(new Event('storage'));
                    window.dispatchEvent(new Event('auth-updated'));
                    
                    toast({
                        title: t('authSuccessful'),
                        description: t('createdApiToken', { username: deviceFlowAuth.authResult.username || 'user' }),
                        status: "success",
                        duration: 5000,
                    });
                    
                    onDeviceFlowClose();
                    deviceFlowAuth.reset();
                } catch (error) {
                    console.error("Failed to create API token:", error);
                    
                    toast({
                        title: t('failedCreateApiToken'),
                        description: error.message || t('unknownApiTokenError'),
                        status: "error",
                        duration: 8000,
                    });
                    
                    // Reset the device flow but keep the modal open so user can retry
                    deviceFlowAuth.reset();
                }
            }
        };
        
        createAndSaveApiToken();
    }, [deviceFlowAuth.authResult]);

    // Handle device flow errors
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

    return (
        <VStack spacing={4} align="stretch">
            <Box>
                <FormLabel fontSize="sm" mb={2}>{t('authMethod')}</FormLabel>
                <Select size="sm" value={authMethod} onChange={(e) => setAuthMethod(e.target.value)}>
                    <option value="basic">{t('basicAuth')}</option>
                    <option value="api_key">{t('apiKeyAuth')}</option>
                </Select>
            </Box>

            {authMethod === 'api_key' && (
                <Box>
                    <FormLabel fontSize="sm">{t('apiKeyLabel')}</FormLabel>
                    <Input
                        size="sm"
                        type="password"
                        value={auth.api_key}
                        onChange={(e) => {
                            const newAuth = { ...auth, api_key: e.target.value };
                            setAuth(newAuth);
                            // Save immediately
                            localStorage.setItem(getServerStorageKey("api_key"), newAuth.api_key || "");
                            window.dispatchEvent(new Event('storage'));
                            window.dispatchEvent(new Event('auth-updated'));
                        }}
                        placeholder={t('enterApiKey')}
                        borderColor={!auth.isAuthenticated && (!auth.api_key || auth.api_key === "") ? "red.300" : "inherit"}
                        _hover={{ borderColor: !auth.isAuthenticated && (!auth.api_key || auth.api_key === "") ? "red.400" : "inherit" }}
                        _focus={{ borderColor: !auth.isAuthenticated && (!auth.api_key || auth.api_key === "") ? "red.500" : "#FFD230" }}
                    />
                </Box>
            )}


            {authMethod === 'basic' && (
                <>
                    {isNucleusBackend(backend) ? (
                        <Box>
                            {auth.password ? (
                                <VStack align="stretch" spacing={2}>
                                    <Text fontSize="sm" color="#FFD230">
                                        {t('authenticatedWithNucleus')}
                                    </Text>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        colorScheme="red"
                                        onClick={() => {
                                            // === LM CUSTOMIZATION: 使用统一的用户主动清除工具函数 ===
                                            const newAuth = { ...auth, username: '', password: '' };
                                            setAuth(newAuth);
                                            clearAuthByUserAction(selectedServer);
                                        }}
                                    >
                                        {t('clearToken')}
                                    </Button>
                                </VStack>
                            ) : (
                                <Button
                                    size="sm"
                                    bg="#FFD230"
                                    color="black"
                                    _hover={{ bg: "#F6C80F" }}
                                    width="100%"
                                    onClick={handleStartDeviceFlow}
                                    leftIcon={<UnlockIcon />}
                                >
                                    {t('getTokenFromNucleus')}
                                </Button>
                            )}
                        </Box>
                    ) : (
                        <>
                            <Box>
                                <FormLabel fontSize="sm">{t('username')}</FormLabel>
                                <Input
                                    size="sm"
                                    value={auth.username}
                                    onChange={(e) => {
                                        const newAuth = { ...auth, username: e.target.value };
                                        setAuth(newAuth);
                                        // Save immediately
                                        localStorage.setItem(getServerStorageKey("username"), newAuth.username || "");
                                        window.dispatchEvent(new Event('storage'));
                                        window.dispatchEvent(new Event('auth-updated'));
                                    }}
                                    placeholder={t('enterUsername')}
                                    borderColor={!auth.isAuthenticated && (!auth.username || auth.username === "") ? "red.300" : "inherit"}
                                    _hover={{ borderColor: !auth.isAuthenticated && (!auth.username || auth.username === "") ? "red.400" : "inherit" }}
                                    _focus={{ borderColor: !auth.isAuthenticated && (!auth.username || auth.username === "") ? "red.500" : "#FFD230" }}
                                />
                                {isS3Backend(backend) && (
                                    <Text fontSize="xs" color="gray.400" mt={1}>
                                        {t('usernameHelp')}
                                    </Text>
                                )}
                            </Box>
                            {isS3Backend(backend) ? null : (
                            <Box>
                                <FormLabel fontSize="sm">{t('password')}</FormLabel>
                                <Input
                                    size="sm"
                                    type="password"
                                    value={auth.password}
                                    onChange={(e) => {
                                        const newAuth = { ...auth, password: e.target.value };
                                        setAuth(newAuth);
                                        // Save immediately
                                        localStorage.setItem(getServerStorageKey("password"), newAuth.password || "");
                                        window.dispatchEvent(new Event('storage'));
                                        window.dispatchEvent(new Event('auth-updated'));
                                    }}
                                    placeholder={t('enterPassword')}
                                    borderColor={!auth.isAuthenticated && (!auth.password || auth.password === "") ? "red.300" : "inherit"}
                                    _hover={{ borderColor: !auth.isAuthenticated && (!auth.password || auth.password === "") ? "red.400" : "inherit" }}
                                    _focus={{ borderColor: !auth.isAuthenticated && (!auth.password || auth.password === "") ? "red.500" : "#FFD230" }}
                                />
                            </Box>
                            )}
                        </>
                    )}
                </>
            )}

            {/* <Box>
                <HStack spacing={2} justify="space-between">
                    <Text fontSize="xs" color="gray.600">
                        Status: {auth.username ? "Basic auth set" :
                                auth.api_key ? "API Key set" : "No authentication"}
                    </Text>
                    <Button size="xs" variant="ghost" colorScheme="red" onClick={() => {
                        // Clear all auth for current server
                        localStorage.removeItem(getServerStorageKey("api_key"));
                        localStorage.removeItem(getServerStorageKey("username"));
                        localStorage.removeItem(getServerStorageKey("password"));
                        setAuth({
                            api_key: "",
                            username: "",
                            password: "",
                        });
                        window.dispatchEvent(new Event('storage'));
                    }}>
                        Clear
                    </Button>
                </HStack>
            </Box> */}

            {/* Device Flow Modal */}
            <Modal isOpen={isDeviceFlowOpen} onClose={() => { onDeviceFlowClose(); deviceFlowAuth.reset(); }} size="md">
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>{t('authenticateWithNucleus')}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        {deviceFlowAuth.isLoading && (
                            <VStack spacing={4} py={4}>
                                <Text>{t('connectingToNucleus')}</Text>
                            </VStack>
                        )}
                        
                        {deviceFlowAuth.deviceFlowData && !deviceFlowAuth.authResult && (
                            <VStack spacing={4} py={4} align="stretch">
                                <Text fontSize="sm" color="gray.300">
                                    {t('deviceFlowInstructions')}
                                </Text>
                                
                                <Box bg="#1C1D20" p={4} borderRadius="md" textAlign="center" border="1px solid #383838">
                                    <Text fontSize="2xl" fontWeight="bold" letterSpacing="0.2em" color="#FFD230">
                                        {deviceFlowAuth.deviceFlowData.user_code}
                                    </Text>
                                </Box>
                                
                                <VStack spacing={2}>
                                    <Link 
                                        href={(() => {
                                            const uri = deviceFlowAuth.deviceFlowData.verification_uri;
                                            // If verification_uri has a port (e.g., https://server:3180/...), use standard login URL instead
                                            if (uri && /:\d+/.test(uri)) {
                                                const serverHost = getServerHttpsUrl(backend).replace(/^https?:\/\//, '').split('/')[0];
                                                return `https://${serverHost}/omni/auth/login/device`;
                                            }
                                            return uri || getServerHttpsUrl(backend);
                                        })()} 
                                        isExternal 
                                        color="blue.400"
                                    >
                                        {t('openNucleusLoginPage')} <ExternalLinkIcon mx="2px" />
                                    </Link>
                                </VStack>
                                
                                {deviceFlowAuth.isPolling && (
                                    <HStack justify="center" spacing={2}>
                                        <Box 
                                            as="span" 
                                            w={2} 
                                            h={2} 
                                            bg="#FFD230" 
                                            borderRadius="full"
                                            animation="pulse 1.5s ease-in-out infinite"
                                        />
                                        <Text fontSize="sm" color="gray.400">
                                            {t('waitingForCode')}
                                        </Text>
                                    </HStack>
                                )}
                                
                                <Text fontSize="xs" color="gray.400" textAlign="center">
                                    {t('codeExpiresIn', { minutes: Math.floor((deviceFlowAuth.deviceFlowData.expires_in || 900) / 60) })}
                                </Text>
                            </VStack>
                        )}
                        
                        {deviceFlowAuth.error && (
                            <VStack spacing={4} py={4}>
                                <Text color="red.400">{deviceFlowAuth.error}</Text>
                                <Button size="sm" onClick={handleStartDeviceFlow}>
                                    {t('tryAgain')}
                                </Button>
                            </VStack>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" onClick={() => { onDeviceFlowClose(); deviceFlowAuth.reset(); }}>
                            {t('cancel')}
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </VStack>
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

// === LM CUSTOMIZATION: SearchSettingsTrigger START ===
// 顶栏"搜索设置"齿轮按钮抽出来作为独立内部组件，让 useTranslation() 能在 LanguageProvider 子树内合法调用
// （App 组件本身没有调 useTranslation，无法直接在其 JSX 里使用 t）。
// 点击后派发 CustomEvent('open-search-settings')，由 SearchSettingsPopover 监听并打开。
// 4.6 增强：订阅 'hybrid-config-customized' 事件，在 hybridConfig 偏离默认时显示金色小圆点 Badge，
//          状态可见性 / Badge 配色与 FilterPopoverButton 等其它筛选 badge 风格保持一致。
// 4.7 增强（UX 修复）：
//   1) 图标从 SettingsIcon（齿轮）替换成 TuneIcon（滑块 / Material Design "tune"），
//      与 FabToolbar 的“视图设置”齿轮做强视觉区分，避免顶栏出现两个长得一样的齿轮。
//   2) 点击时派发事件携带触发按钮的 getBoundingClientRect()，让 SearchSettingsPopover
//      可以基于齿轮真实 DOM 位置做 fixed 定位（top = rect.bottom+8, right = innerWidth-rect.right），
//      消除 “弹窗飘到屏幕最右边、与触发按钮无视觉联动” 的问题。
// 4.7+ 优化：
//   3) TuneIcon 抽到 components/icons/MaterialIcons.jsx 公共模块，避免后续重复定义。
//   4) IconButton 上加 data-search-settings-trigger="true" 显式标识，让 Popover 端不靠
//      aria-label 模糊匹配找齿轮，能避免未来同名 aria-label 冲突。
// 合入英伟达新版时：整个组件 + JSX 调用都包在 LM 块里，删除时只需删本块和 JSX 调用处即可。

const SearchSettingsTriggerButton = () => {
    const { t } = useTranslation();
    const [hasCustom, setHasCustom] = useState(false);
    // 4.8 UX：订阅 Popover 端 isOpen 变化（事件名 search-settings-state-changed），
    // 让齿轮按钮在 Popover 打开期间呈现金色激活态背景 + aria-expanded，
    // 满足 UX Checklist #6 状态可见性。即使鼠标移开按钮，也能直观判断 Popover 状态。
    const [isOpen, setIsOpen] = useState(false);
    // 4.7：用 ref 拿齿轮按钮的 DOM 节点，点击时把 rect 附在事件上传给 Popover
    const triggerRef = useRef(null);

    useEffect(() => {
        const handleCustom = (e) => {
            const next = !!(e.detail && e.detail.isCustom);
            setHasCustom((prev) => (prev === next ? prev : next));
        };
        window.addEventListener('hybrid-config-customized', handleCustom);
        return () => window.removeEventListener('hybrid-config-customized', handleCustom);
    }, []);

    // 4.8 UX：订阅 Popover 状态广播事件，与 SearchSettingsPopover 内常量
    // SEARCH_SETTINGS_STATE_EVENT 同名（保留字符串字面量避免循环导入风险）
    useEffect(() => {
        const handleState = (e) => {
            const next = !!(e.detail && e.detail.isOpen);
            setIsOpen((prev) => (prev === next ? prev : next));
        };
        window.addEventListener('search-settings-state-changed', handleState);
        return () => window.removeEventListener('search-settings-state-changed', handleState);
    }, []);

    const labelBase = t('searchSettings') || 'Search settings';
    const labelCustomized = t('searchSettingsCustomized') || 'Search settings (customized)';
    const label = hasCustom ? labelCustomized : labelBase;

    // 4.7：派发 open-search-settings 时附带触发按钮 rect，用于 Popover 锚定
    const handleOpen = () => {
        const rect = triggerRef.current?.getBoundingClientRect?.();
        window.dispatchEvent(
            new CustomEvent('open-search-settings', {
                detail: rect
                    ? {
                          rect: {
                              top: rect.top,
                              left: rect.left,
                              right: rect.right,
                              bottom: rect.bottom,
                              width: rect.width,
                              height: rect.height,
                          },
                      }
                    : undefined,
            }),
        );
    };

    return (
        // 与 HeaderIcons 其它按钮（语言切换 / 服务器选择 / Info / Share）保持一致的风格：
                        // size="sm" 幽灵态 + 浅灰色图标，避免在同一顶栏中出现 "一个 40px 金色圆环 + 一堆 sm幽灵" 的风格断层。
                        // hasCustom 状态下颜色提升为金色 + 右上角金色小圆点，保持“状态可见性” UX checklist。
        <Tooltip label={label} placement="bottom" hasArrow>
            <Box position="relative" display="inline-flex" flexShrink={0}>
                <IconButton
                    ref={triggerRef}
                    data-search-settings-trigger="true"
                    size="sm"
                    variant="ghost"
                    aria-label={label}
                    aria-haspopup="dialog"
                    aria-expanded={isOpen}
                    icon={<TuneIcon boxSize={4} />}
                    // 4.8 UX：isOpen 时金色 12% 透明背景 + 金色图标，呈现激活态；
                    // 优先级 isOpen > hasCustom > 默认（打开时直接以"金色填充"压过定制态金色，
                    // 让用户能从颜色饱和度区分"Popover 是否展开"与"已有自定义"两层信息）。
                    color={isOpen ? '#FFD230' : hasCustom ? '#FFD230' : '#ABABAB'}
                    bg={isOpen ? 'rgba(255,210,48,0.12)' : 'transparent'}
                    _hover={{
                        color: isOpen || hasCustom ? '#FFD230' : 'white',
                        bg: isOpen ? 'rgba(255,210,48,0.18)' : 'rgba(255,255,255,0.06)',
                    }}
                    _active={{ bg: 'rgba(255,210,48,0.22)' }}
                    _focusVisible={{ boxShadow: '0 0 0 2px #FFD230' }}
                    transition="color 200ms ease, background 200ms ease"
                    onClick={handleOpen}
                />
                {hasCustom && (
                    // 金色小圆点 Badge — 7×7 px，按钮右上角；
                    // 不靠颜色单独传达信息（Tooltip 文案已说明 customized），可达性达标。
                    <Box
                        position="absolute"
                        top="2px"
                        right="2px"
                        w="7px"
                        h="7px"
                        borderRadius="999px"
                        bg="#FFD230"
                        boxShadow="0 0 0 2px #1A1A1A, 0 0 4px rgba(255,210,48,0.6)"
                        pointerEvents="none"
                        aria-hidden
                    />
                )}
            </Box>
        </Tooltip>
    );
};
// === LM CUSTOMIZATION: SearchSettingsTrigger END ===

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

                    {/* 中间：胶囊搜索框 + 紧贴右侧的“搜索设置”齿轮（整组居中且搜索框拉满）
                       === LM CUSTOMIZATION: SearchSettingsTrigger START ===
                         布局策略：
                          - 外层 HStack 用 flex={1} 占满 logo 与 HeaderIcons 之间的空间，并 mx="auto" 视觉居中
                          - maxW 720px = TopSearchBar 自身 max-width 680px + 齿轮 36px + spacing 8px，
                            避免搜索框被无限拉伸（与 Fab.com / NVIDIA 原版"中间一段胶囊框"风格一致）
                          - TopSearchBar 用 flex={1} 撑满 HStack 剩余空间（直到自身 680px 上限）
                          - 齿轮 flexShrink={0} 紧贴搜索框右侧 8px
                         之前问题：原写法 `mx="auto" flexShrink={1}` 让 HStack 按内容收缩，
                                  导致搜索框只用"自然宽度"（远小于 680px），两侧大量留白。
                         合入英伟达新版时：仅保留 LM 标记块；原版 TopSearchBar 独立居中只需干掉 HStack 包裹即可。 */}
                    <HStack
                        flex={1}
                        mx="auto"
                        maxW="720px"
                        spacing={2}
                        minW={0}
                    >
                        <Box flex={1} minW={0}>
                            <TopSearchBar style={{ margin: 0, width: '100%', maxWidth: '680px' }} />
                        </Box>
                        <SearchSettingsTriggerButton />
                    </HStack>
                    {/* === LM CUSTOMIZATION: SearchSettingsTrigger END === */}

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

