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

import React, {useState, useEffect} from 'react';
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
import { LanguageProvider, useTranslation } from './i18n/LanguageContext';

import {extendTheme, ColorModeScript} from '@chakra-ui/react';
import {mode} from '@chakra-ui/theme-tools';
import SearchApp from "./HybridDeepSearchUI";
import {StyleFunctionProps} from "@chakra-ui/react";
import logo from "./img/lm_logo.png";
import { apiUrl as defaultApiUrl, SERVER_MAPPING, defaultEmbeddingConfig } from "./config";
import GraphVisualization from "./Graph";
import persistentCache from "./utils/persistentImageCache";
import { useDeviceFlowAuth, getServerHttpsUrl, AuthStatus, createApiToken } from "./nucleus";

// LightArt-inspired dark theme color tokens
const LA = {
    primary: '#FFD230',       // Golden yellow primary
    primaryHover: '#F6C80F',  // Darker gold for hover
    primaryDim: 'rgba(246,200,15,0.15)', // Subtle gold bg
    bg: '#141517',            // Near-black background
    bgCard: '#1C1D20',       // Card background
    bgElevated: '#232428',   // Elevated surfaces (popover, dropdown)
    bgInput: '#1C1D20',      // Input background
    border: '#383838',       // Border color
    borderHover: '#FFD230',  // Border hover = gold
    text: '#FFFFFF',         // Primary text
    textSecondary: '#E5E5E5',// Secondary text
    textTertiary: '#D8D8D8', // Tertiary text
    textMuted: '#ABABAB',    // Muted text
    textDim: '#6B6B6B',      // Very dim text
    success: '#52C41A',      // Green for success
    danger: '#FF4D4F',       // Red for danger
    info: '#1890FF',         // Blue for info
    purple: '#B37FEB',       // Purple accent
};

const theme = extendTheme({
    colors: {
        brand: {
            50: '#FFF9E0',
            100: '#FFECB3',
            200: '#FFE082',
            300: '#FFD54F',
            400: '#FFD230',
            500: '#F6C80F',
            600: '#E8B800',
            700: '#C49A00',
            800: '#9C7B00',
            900: '#745C00',
        },
        gray: {
            900: LA.bg,
            800: LA.bgCard,
            700: LA.bgElevated,
            600: LA.border,
            500: '#3A3A3A',
            400: '#6B6B6B',
            300: LA.textMuted,
            200: LA.textTertiary,
            100: LA.textSecondary,
            50: LA.text,
        }
    },
    fonts: {
        heading: `'Noto Sans SC', 'NVIDIA Sans Bold', -apple-system, BlinkMacSystemFont, sans-serif`,
        body: `'Noto Sans SC', 'NVIDIA Sans', -apple-system, BlinkMacSystemFont, sans-serif`,
    },
    components: {
        Input: {
            defaultProps: {
                focusBorderColor: LA.primary,
            },
            baseStyle: {
                field: {
                    bg: LA.bgInput,
                    borderColor: LA.border,
                    _hover: { borderColor: LA.primary },
                    _focus: { borderColor: LA.primary, boxShadow: `0 0 0 1px ${LA.primary}` },
                }
            }
        },
        Select: {
            defaultProps: {
                focusBorderColor: LA.primary,
            }
        },
        Button: {
            variants: {
                solid: (props) => {
                    if (props.colorScheme === 'green' || props.colorScheme === 'brand') {
                        return {
                            bg: LA.primary,
                            color: '#000000',
                            fontWeight: '600',
                            _hover: { bg: LA.primaryHover, transform: 'translateY(-1px)', boxShadow: `0 4px 12px rgba(255,210,48,0.3)` },
                            _active: { bg: '#D4A800', transform: 'translateY(0)' },
                        };
                    }
                    return {};
                },
                outline: (props) => {
                    if (props.colorScheme === 'green' || props.colorScheme === 'brand') {
                        return {
                            borderColor: LA.primary,
                            color: LA.primary,
                            _hover: { bg: LA.primaryDim },
                        };
                    }
                    return {};
                },
                ghost: {
                    _hover: { bg: 'rgba(255,255,255,0.06)' },
                },
            }
        },
        Card: {
            baseStyle: {
                container: {
                    bg: LA.bgCard,
                    borderColor: LA.border,
                    borderWidth: '1px',
                    borderRadius: '12px',
                    transition: 'all 0.25s ease',
                    _hover: {
                        borderColor: LA.primary,
                        boxShadow: `0 0 20px rgba(255,210,48,0.08)`,
                    },
                },
            },
        },
        Modal: {
            baseStyle: {
                dialog: {
                    bg: LA.bgCard,
                    borderColor: LA.border,
                    borderWidth: '1px',
                    borderRadius: '16px',
                },
                header: {
                    color: LA.text,
                    borderBottomColor: LA.border,
                },
                closeButton: {
                    color: LA.textMuted,
                    _hover: { color: LA.text },
                },
            },
        },
        Popover: {
            baseStyle: {
                content: {
                    bg: LA.bgElevated,
                    borderColor: LA.border,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                },
                header: {
                    borderBottomColor: LA.border,
                    color: LA.text,
                },
            },
        },
        Tooltip: {
            baseStyle: {
                bg: LA.bgElevated,
                color: LA.text,
                borderRadius: '8px',
                px: 3,
                py: 2,
                fontSize: 'sm',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            },
        },
        Switch: {
            defaultProps: {
                colorScheme: 'yellow',
            },
        },
        Badge: {
            baseStyle: {
                borderRadius: '6px',
                fontWeight: '500',
                px: 2,
                py: 0.5,
            },
        },
        Accordion: {
            baseStyle: {
                container: {
                    borderColor: LA.border,
                },
                button: {
                    _hover: { bg: 'rgba(255,255,255,0.04)' },
                },
            },
        },
        Divider: {
            baseStyle: {
                borderColor: LA.border,
            },
        },
        Table: {
            variants: {
                simple: {
                    th: {
                        borderColor: LA.border,
                        color: LA.textMuted,
                    },
                    td: {
                        borderColor: LA.border,
                    },
                },
            },
        },
    },
    shadows: {outline: `0 0 0 3px rgba(255,210,48,0.4)`},
    config: {
        initialColorMode: 'dark',
        useSystemColorMode: false,
    },
    styles: {
        global: (props) => ({
            body: {
                fontFamily: 'body',
                color: LA.text,
                bg: LA.bg,
                lineHeight: 'base',
            },
            // Custom scrollbar styling
            '::-webkit-scrollbar': {
                width: '6px',
                height: '6px',
            },
            '::-webkit-scrollbar-track': {
                bg: 'transparent',
            },
            '::-webkit-scrollbar-thumb': {
                bg: LA.border,
                borderRadius: '3px',
                _hover: { bg: '#555' },
            },
            // Selection color
            '::selection': {
                bg: 'rgba(255,210,48,0.3)',
                color: LA.text,
            },
        }),
    },
});

// Authentication Form Component
const AuthForm = ({ auth, setAuth, getServerStorageKey }) => {
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
            const servers = Object.keys(SERVER_MAPPING);
            return servers.length > 0 ? servers[0] : "";
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
                
                if (isNucleusBackend(backend)) {
                    newUsername = '$omni-api-token';
                    newPassword = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjYWx2aW5ndSIsInByb2ZpbGUiOnsiZmlyc3RfbmFtZSI6bnVsbCwibGFzdF9uYW1lIjpudWxsLCJlbWFpbCI6ImNhbHZpbmd1IiwiYWRtaW4iOnRydWUsIm51Y2xldXNfcm8iOmZhbHNlLCJyZWFkb25seSI6ZmFsc2UsInByb3ZpZGVyIjoiU0FNTCIsImVuYWJsZWQiOnRydWUsImFjdGl2YXRlZCI6dHJ1ZX0sImp0aSI6IjVmOWE1OTBmNDExMjQ3N2ViZWJlYzAwNzcwOGYwNDg5IiwiaWF0IjoxNzY1MTg4Nzg1fQ.oX_9THuHT7B3tukN6MznyDO1FGFRZzDlDt8x5rBDyWbQLYug45KFMWBdFT1U6bfnjjaGtQaryDpS_621u76i77P0EsuPmwzrv0motvNySejXPrOZTgbJqJ21FatLhpTHSMNdazzFojGypXi8rpbUfxwZtf-Shc71LD3mTlYEY794z6l3rjAbL4ckzhhOWn3n4x8IQWigkD1zPgwm7_ErThEH6bCbNRMq3pcIDMa4P9ohREqsZTHCYnP0hQHNkv6gBd5uKae1i62TLvxQjnqymh-byXSxo3TV3OwC3PkmiWMRAqbj6xsCdD-eG4ZFTuwNiJbqC_ncmja7xxHtx4QogYRGboA3rY0pUIslbGeASGahd_aIOf_YQ0z2_-QmCLULiPw17XoqNVuJ7jW4ZX4K8iOYT6DcmPnZjNytX1YevQ9HHyRBcYbbQlHO2mFCZFz63l6vsZxcbGGrxUJ4L9ZJQtSv563Yjf1trPCt8QPlAPg24wa6QzpvawyURC7nQgTKvLICYG2KjUev-qKd9rfRNYiZGKBnguH4aPPy9FJbSpJogThwO8aKg9C2cNOs4NeBf9RF-_xF5coXoXCVrJ25w8udge-kd8LxQCxjZFPIie0W7o2EUL7x9chpeHhHvgv6eQU8TApPi5LfWlcISuLeJnAl4Wx1uP2C-YbX62ruh5g'
                } else if (isS3Backend(backend)) {
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
        localStorage.removeItem(getServerStorageKey("api_key"));
        localStorage.removeItem(getServerStorageKey("username"));
        localStorage.removeItem(getServerStorageKey("password"));
        // Mark that the user explicitly cleared credentials for this server
        localStorage.setItem(getServerStorageKey("auth_cleared"), "true");
        setAuth({
            api_key: "",
            username: "",
            password: "",
        });
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('auth-updated'));
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
                                            const newAuth = { ...auth, username: '', password: '' };
                                            setAuth(newAuth);
                                            localStorage.removeItem(getServerStorageKey("api_key"));
                                            localStorage.removeItem(getServerStorageKey("username"));
                                            localStorage.removeItem(getServerStorageKey("password"));
                                            // Mark that the user explicitly cleared credentials for this server
                                            localStorage.setItem(getServerStorageKey("auth_cleared"), "true");
                                            window.dispatchEvent(new Event('storage'));
                                            window.dispatchEvent(new Event('auth-updated'));
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
        
        // Otherwise, if we have servers in the mapping, select the first one
        const servers = Object.keys(SERVER_MAPPING);
        const defaultServer = servers.length > 0 ? servers[0] : "";
        return defaultServer;
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
        
        // Update server parameter
        existingParams.server = serverName;
        
        // Reconstruct URL with all parameters
        const newParams = new URLSearchParams(existingParams);
        const url = new URL(window.location);
        url.search = newParams.toString();
        window.history.replaceState({}, '', url);
                
        // Dispatch a custom event to notify other components about the server change
        window.dispatchEvent(new CustomEvent('server-changed', { 
            detail: { server: serverName, embeddingConfig: newEmbeddingConfig }
        }));        
    };
    
    // Use disclosure for auth popover - always starts closed
    const { isOpen: isAuthOpen, onOpen: onAuthOpen, onClose: onAuthClose, onToggle: onAuthToggle } = useDisclosure();
        
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
                <Popover>
                    <PopoverTrigger>
                        <HStack 
                            spacing={2} 
                            bg="#FFD230"
                            px={3}
                            py={1.5}
                            borderRadius="8px"
                            cursor="pointer"
                            _hover={{ bg: "#F6C80F", boxShadow: "0 2px 8px rgba(255,210,48,0.3)" }}
                            minW="100px"
                            transition="all 0.2s"
                        >
                            <Text 
                                color="black" 
                                fontSize="sm" 
                                fontWeight="600"
                                noOfLines={1}
                            >
                                {SERVER_MAPPING[selectedServer]?.name || t('selectServer')}
                            </Text>
                            <IconButton
                                size="xs"
                                variant="unstyled"
                                icon={<ChevronDownIcon color="black" />}
                                aria-label={t('selectServer')}
                                height="auto"
                                minW="auto"
                                display="inline-flex"
                            />
                        </HStack>
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
                                        {Object.entries(SERVER_MAPPING).map(([key, config]) => (
                                            <option key={key} value={key}>{config.name}</option>
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
                                    <AuthForm auth={auth} setAuth={setAuth} getServerStorageKey={getServerStorageKey} />
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
                            <AuthForm auth={auth} setAuth={setAuth} getServerStorageKey={getServerStorageKey} />
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
    useEffect(() => {
        // Initialize persistent image cache on app startup
        persistentCache.init().then(supported => {
            console.log(`Persistent image cache ${supported ? 'initialized' : 'not supported'}`);
        }).catch(err => {
            console.warn('Failed to initialize persistent image cache:', err);
        });
    }, []);

    return (
        <LanguageProvider>
        <ChakraProvider theme={theme}>
            <Box 
                w="100%" 
                h="66px" 
                bg="#141517"
                borderBottom="1px solid #383838"
                position="sticky"
                top={0}
                zIndex={1000}
                backdropFilter="blur(12px)"
            >
                <Flex h="100%" alignItems="center" flexDir="row" justify="space-between" px={6}>
                    <Flex alignItems="center" gap={3}>
                        <Image src={logo} alt="LIGHT MARKET" h="42px" filter="brightness(1.1)"/>
                        <Flex alignItems={"baseline"} gap={2}>
                            <Heading fontSize="xl" fontWeight="600" color="white" letterSpacing="-0.01em">DeepSearch Explorer</Heading>
                            <Text fontSize="xs" color="#ABABAB" fontWeight="400">v 1.3.0</Text>
                        </Flex>
                    </Flex>
                    <HeaderIcons handleSearch={() => window.dispatchEvent(new Event('trigger-search'))} />
                </Flex>
            </Box>
            <ColorModeScript initialColorMode={theme.config.initialColorMode}/>
            <SearchApp/>
        </ChakraProvider>
        </LanguageProvider>
    );
};

const container = document.getElementById('root');
const root = ReactDOMClient.createRoot(container);
root.render(
      <App/>
);

