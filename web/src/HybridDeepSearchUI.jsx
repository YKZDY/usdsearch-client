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

import React, { useEffect, useState, useCallback, useMemo, useDeferredValue, useRef } from "react";
import {
  Box,
  VStack,
  HStack,
  Input,
  InputGroup,
  InputRightElement,
  Button,
  Text,
  IconButton,
  Image,
  useToast,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Switch,
  FormControl,
  FormLabel,
  Badge,
  Tooltip,
  Grid,
  GridItem,
} from "@chakra-ui/react";
import {
  SearchIcon,
  CloseIcon,
  InfoIcon,
  ViewIcon,
  HamburgerIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  AddIcon,
  MinusIcon,
} from "@chakra-ui/icons";

import { apiUrl as defaultApiUrl, defaultEmbeddingConfig, AUTH_CONFIG, FEATURE_FLAGS, SERVER_MAPPING, SEARCH_DEFAULTS, DEFAULT_SEARCH_PARAMS } from "./config";
import { useTranslation } from "./i18n/LanguageContext";
import HybridSearchConfig, { DEFAULT_HYBRID_CONFIG } from "./HybridSearchConfig";
import SearchFilters from "./SearchFilters";
import HybridSearchResults from "./HybridSearchResults";
import VirtualizedHybridSearchResults from "./components/VirtualizedHybridSearchResults";
import AssetDetailsModal from "./AssetDetailsModal";
import AssetImage from "./components/AssetImage";

// Helper: shallow compare two Sets
const areSetsEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
};

// Memoized results component to prevent re-renders when modal opens/closes
const MemoizedResults = React.memo(({ 
  results, 
  showOnlyWithPreviews, 
  onItemClick, 
  copyToClipboard, 
  onFindSimilar,
  showScores, 
  viewMode, 
  gridSize, 
  isLoading, 
  lastSearchQuery, 
  getHeaders, 
  apiUrl,
  useVirtualization = true,
  selectedItems,
  onSelectionChange,
  onCopySelectedUrls
}) => {
  const filteredResults = useMemo(() => 
    showOnlyWithPreviews 
      ? results.filter(item => item.thumbnail_exists === true) 
      : results,
    [results, showOnlyWithPreviews]
  );

  const ResultsComponent = useVirtualization && filteredResults.length > 50 
    ? VirtualizedHybridSearchResults 
    : HybridSearchResults;

  return (
    <ResultsComponent
      results={filteredResults}
      onItemClick={onItemClick}
      copyToClipboard={copyToClipboard}
      onFindSimilar={onFindSimilar}
      showScores={showScores}
      viewMode={viewMode}
      gridSize={gridSize}
      isLoading={isLoading}
      isEmpty={filteredResults.length === 0 && !isLoading}
      searchQuery={lastSearchQuery}
      getHeaders={getHeaders}
      apiUrl={apiUrl}
      selectedItems={selectedItems}
      onSelectionChange={onSelectionChange}
      onCopySelectedUrls={onCopySelectedUrls}
    />
  );
}, (prevProps, nextProps) => {
  // Custom comparison - handle Set properly
  if (!areSetsEqual(prevProps.selectedItems, nextProps.selectedItems)) return false;
  
  // Compare all other props shallowly
  const keys = Object.keys(nextProps).filter(k => k !== 'selectedItems');
  for (const key of keys) {
    if (prevProps[key] !== nextProps[key]) return false;
  }
  return true;
});

const HybridDeepSearchUI = () => {
  const { t } = useTranslation();
  
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery); // Defer heavy re-renders while typing
  const [lastSearchQuery, setLastSearchQuery] = useState(""); // Store the query used for the current results
  const apiUrl = defaultApiUrl;
  const [embeddingConfig, setEmbeddingConfig] = useState(() => {
    // Get initial embedding config from server mapping based on URL param or first server
    const urlParams = new URLSearchParams(window.location.search);
    const serverParam = urlParams.get('server');
    
    if (serverParam && SERVER_MAPPING[serverParam]?.embedding_config) {
      return SERVER_MAPPING[serverParam].embedding_config;
    }
    
    // Fall back to first server in mapping if available
    const servers = Object.keys(SERVER_MAPPING);
    if (servers.length > 0 && SERVER_MAPPING[servers[0]]?.embedding_config) {
      return SERVER_MAPPING[servers[0]].embedding_config;
    }
    
    return defaultEmbeddingConfig;
  });

  // State for selected storage backend
  const [selectedBackend, setSelectedBackend] = useState(() => {
    // Check URL for server parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const serverParam = urlParams.get('server');
    
    // If server is in URL and exists in mapping, use it
    if (serverParam && Object.keys(SERVER_MAPPING).includes(serverParam)) {
      return serverParam;
    }
    
    // Otherwise, if we have servers in the mapping, select the first one
    const servers = Object.keys(SERVER_MAPPING);
    return servers.length > 0 ? servers[0] : "";
  });

  // Listen for server selection changes from the header
  useEffect(() => {
    const handleServerChange = (event) => {
      if (event.detail.server) {
        // Set the selected backend
        setSelectedBackend(event.detail.server);
        setEmbeddingConfig(event.detail.embeddingConfig || defaultEmbeddingConfig);
        setResults([]);
        
        // Update auth state with server-specific credentials using shared helper
        if (isAuthCleared(event.detail.server)) {
          setAuth({ api_key: "", nucleus_api_token: "", username: "", password: "", isAuthenticated: false });
        } else {
          const creds = readAuthCredentials(event.detail.server);
          const username = creds.username !== null ? creds.username : AUTH_CONFIG.DEFAULT_USERNAME;
          const password = creds.password !== null ? creds.password : AUTH_CONFIG.DEFAULT_PASSWORD;
          setAuth({
            ...creds,
            username,
            password,
            isAuthenticated: !!(
              (AUTH_CONFIG.ENABLE_NUCLEUS_AUTH && creds.nucleus_api_token) ||
              (AUTH_CONFIG.ENABLE_API_KEY_AUTH && creds.api_key) ||
              (AUTH_CONFIG.ENABLE_BASIC_AUTH && (username !== "") && (password !== ""))
            ),
          });
        }
        
        // Reset and refetch properties data for the new server
        setPropertiesData(null);
        const fetchData = async () => {
          try {
            // Only fetch if authenticated
            const creds = readAuthCredentials(event.detail.server);
            const hasAuth = !!(creds.api_key || (creds.username && creds.password) || creds.nucleus_api_token);
            if (!hasAuth) {
              return;
            }
            const headers = getHeaders();
            const response = await fetch(`${apiUrl}/search/stats/usd_properties`, {
              method: 'GET',
              headers: headers
            });
            const data = await response.json();
            setPropertiesData(data);
          } catch (error) {
            console.error("Error fetching property data after server change:", error);
          }
        };
        fetchData();
      }
    };
    window.addEventListener('server-changed', handleServerChange);
    return () => {
      window.removeEventListener('server-changed', handleServerChange);
    };
  }, []);
  const [imageBase64, setImageBase64] = useState("");
  const [similarSearchAsset, setSimilarSearchAsset] = useState(null);
  const [hybridConfig, setHybridConfig] = useState(DEFAULT_HYBRID_CONFIG);

  // Update hybridConfig when embeddingConfig changes
  useEffect(() => {
    if (embeddingConfig?.field_name) {
      setHybridConfig(prevConfig => {
        // Remove old vector fields and add the new one with the correct embedding config
        const newVectorFields = {
          [embeddingConfig.field_name]: {
            enabled: true,
            weight: 1.0,
            field_name: embeddingConfig.field_name,
            dimension: embeddingConfig.dimension || 1024,
          }
        };
        return {
          ...prevConfig,
          vector_fields: newVectorFields
        };
      });
    }
  }, [embeddingConfig]);
  const [configCollapsed, setConfigCollapsed] = useState(SEARCH_DEFAULTS.configCollapsed);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  // error state removed - was never rendered in JSX
  const [showScores, setShowScores] = useState(SEARCH_DEFAULTS.showScores);
  const [filtersCollapsed, setFiltersCollapsed] = useState(SEARCH_DEFAULTS.filtersCollapsed);
  const [configSidebarCollapsed, setConfigSidebarCollapsed] = useState(true);
  const [viewMode, setViewMode] = useState(SEARCH_DEFAULTS.viewMode);
  const [gridSize, setGridSize] = useState(SEARCH_DEFAULTS.gridSize);
  const [selectedItem, setSelectedItem] = useState(null);
  const [propertiesData, setPropertiesData] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [shouldAutoSearch, setShouldAutoSearch] = useState(false);
  const [showOnlyWithPreviews, setShowOnlyWithPreviews] = useState(SEARCH_DEFAULTS.showOnlyWithPreviews);
  
  const [plugins, setPlugins] = useState({ active: [], inactive: [], isLoading: false });
  const [backend, setBackend] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());

  // Toggle item selection
  const handleToggleSelection = useCallback((item) => {
    const itemId = item.id || item.source?.base_key || item.source?.url;
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  // Helper: copy text to clipboard with toast feedback
  const copyToClipboard = useCallback((text) => {
    const doCopy = () => {
      // Prefer modern Clipboard API (works on HTTPS + localhost)
      if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text).then(
          () => 'success',
          () => { throw new Error('clipboard-api-failed'); }
        );
      }
      // Fallback: execCommand for HTTP non-localhost environments
      return new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
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
        description: t('copyFailedDescription'),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    });
  }, [t]);

  // Copy selected URLs - use refs to keep callback reference stable
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const selectedItemsRef = useRef(selectedItems);
  selectedItemsRef.current = selectedItems;
  
  const copySelectedUrls = useCallback(() => {
    const currentResults = resultsRef.current;
    const currentSelectedItems = selectedItemsRef.current;
    const selectedUrls = currentResults
      .filter(item => {
        const itemId = item.id || item.source?.base_key || item.source?.url;
        return currentSelectedItems.has(itemId);
      })
      .map(item => item.source?.base_key || item.source?.url || item.id)
      .filter(Boolean)
      .join("\n");
    if (selectedUrls) {
      copyToClipboard(selectedUrls);
    }
  }, [copyToClipboard]);
  
  // Feedback popup state (only if feature is enabled)
  const [searchCount, setSearchCount] = useState(() => {
    if (!FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL) return 0;
    const saved = localStorage.getItem('searchCount');
    return saved ? parseInt(saved) : 0;
  });
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const [feedbackDismissed, setFeedbackDismissed] = useState(() => {
    if (!FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL) return true;
    return localStorage.getItem('feedbackDismissed') === 'true';
  });
  const [feedbackShownThisSession, setFeedbackShownThisSession] = useState(false);

  // Search parameters (legacy filters)
  const [searchParams, setSearchParams] = useState({ ...DEFAULT_SEARCH_PARAMS });

  // Helper function to check if backend is S3
  const isS3Backend = (backendString) => {
    return backendString && backendString.toLowerCase().includes('s3');
  };

  // Helper function to check if backend is Nucleus
  const isNucleusBackend = (backendString) => {
    return backendString && backendString.toLowerCase().includes('omniverse://');
  };

  // Shared helper: read auth credentials from localStorage for a given server
  const readAuthCredentials = useCallback((server) => {
    return {
      api_key: (server && localStorage.getItem(`${server}_api_key`)) || localStorage.getItem("api_key") || "",
      nucleus_api_token: (server && localStorage.getItem(`${server}_nucleus_api_token`)) || localStorage.getItem("nucleus_api_token") || "",
      username: server ? (localStorage.getItem(`${server}_username`) ?? localStorage.getItem("username")) : localStorage.getItem("username"),
      password: server ? (localStorage.getItem(`${server}_password`) ?? localStorage.getItem("password")) : localStorage.getItem("password"),
    };
  }, []);

  // Shared helper: check if auth was explicitly cleared for a given server
  const isAuthCleared = useCallback((server) => {
    return (server ? localStorage.getItem(`${server}_auth_cleared`) : localStorage.getItem("auth_cleared")) === "true";
  }, []);

  // Auth state (simplified - you may want to use a proper auth hook)
  const [auth, setAuth] = useState(() => {
    // Determine the initial selected backend to read server-specific keys
    const urlParams = new URLSearchParams(window.location.search);
    const serverParam = urlParams.get('server');
    const initialBackend = (serverParam && Object.keys(SERVER_MAPPING).includes(serverParam))
      ? serverParam
      : (Object.keys(SERVER_MAPPING).length > 0 ? Object.keys(SERVER_MAPPING)[0] : "");

    // Check if user explicitly cleared credentials for this server
    if (isAuthCleared(initialBackend)) {
      return { api_key: "", nucleus_api_token: "", username: "", password: "", isAuthenticated: false };
    }

    const creds = {
      api_key: "",
      nucleus_api_token: "",
      username: null,
      password: null,
    };
    // Use the helper to populate credentials
    Object.assign(creds, readAuthCredentials(initialBackend));

    return {
      api_key: creds.api_key,
      nucleus_api_token: creds.nucleus_api_token,
      username: creds.username !== null ? creds.username : AUTH_CONFIG.DEFAULT_USERNAME,
      password: creds.password !== null ? creds.password : AUTH_CONFIG.DEFAULT_PASSWORD,
      isAuthenticated: false,
    };
  });

  // Listen for auth updates from header component
  useEffect(() => {
    const handleAuthUpdate = () => {
      // Check if user explicitly cleared credentials
      if (isAuthCleared(selectedBackend)) {
        setAuth({ api_key: "", nucleus_api_token: "", username: "", password: "", isAuthenticated: false });
        return;
      }

      // Use the shared helper
      const creds = readAuthCredentials(selectedBackend);
      const username = creds.username !== null ? creds.username : AUTH_CONFIG.DEFAULT_USERNAME;
      const password = creds.password !== null ? creds.password : AUTH_CONFIG.DEFAULT_PASSWORD;

      setAuth({
        api_key: creds.api_key,
        nucleus_api_token: creds.nucleus_api_token,
        username,
        password,
        isAuthenticated: !!(creds.api_key || (username !== "" && password !== "")),
      });
    };

    window.addEventListener('auth-updated', handleAuthUpdate);
    window.addEventListener('storage', handleAuthUpdate);
    
    return () => {
      window.removeEventListener('auth-updated', handleAuthUpdate);
      window.removeEventListener('storage', handleAuthUpdate);
    };
  }, [backend, selectedBackend]);

  // Disclosures
  const { isOpen: isDetailsOpen, onClose: onDetailsClose, onOpen: onDetailsOpen } = useDisclosure();
  const { isOpen: __, onClose: ___onWelcomeClose, onOpen: onWelcomeOpen } = useDisclosure();

  const toast = useToast();

  // Shared helper: show unauthorized toast (defined after useToast to avoid "before initialization" error)
  const showUnauthorizedToast = useCallback(() => {
    toast({
      title: t('loginRequired'),
      description: t('loginRequiredDescription'),
      status: "warning",
      duration: 8000,
      isClosable: true,
    });
  }, [toast, t]);

  // Memoized serialized values to avoid expensive JSON.stringify on every render
  const serializedSearchParams = useMemo(() => JSON.stringify(searchParams), [searchParams]);
  const serializedHybridConfig = useMemo(() => JSON.stringify(hybridConfig), [hybridConfig]);

  // Refs for values that change frequently but shouldn't recreate callbacks
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const imageBase64Ref = useRef(imageBase64);
  imageBase64Ref.current = imageBase64;

  // URL serialization functions (memoized to stabilize handleFindSimilar reference)
  const serializedDefaultHybridConfig = useMemo(() => JSON.stringify(DEFAULT_HYBRID_CONFIG), []);
  const serializeToURL = useCallback((backendOverride = null) => {
    const params = new URLSearchParams();
    
    // Read from refs to avoid dependency on frequently-changing values
    const currentQuery = searchQueryRef.current;
    const currentImage = imageBase64Ref.current;
    
    // Basic search parameters
    if (currentQuery) params.set('q', currentQuery);
    // Store large base64 image data in sessionStorage to avoid URL length limit / browser freeze
    if (currentImage) {
      try {
        sessionStorage.setItem('search_image_base64', currentImage);
        params.set('img', '1');  // Marker: image exists in sessionStorage
      } catch {
        // SessionStorage full or unavailable — skip silently
      }
    } else {
      sessionStorage.removeItem('search_image_base64');
    }
    if (showScores !== SEARCH_DEFAULTS.showScores) params.set('scores', 'true');
    if (viewMode !== SEARCH_DEFAULTS.viewMode) params.set('view', viewMode);
    if (gridSize !== SEARCH_DEFAULTS.gridSize) params.set('gridSize', gridSize);
    if (configCollapsed !== SEARCH_DEFAULTS.configCollapsed) params.set('config_open', 'true');
    if (showOnlyWithPreviews !== SEARCH_DEFAULTS.showOnlyWithPreviews) params.set('with_previews', 'false');

    // Add selected backend to URL parameters
    if (backendOverride) {
        params.set('server', backendOverride);
    } else if (selectedBackend) {
      params.set('server', selectedBackend);
    }
    
    // Search filters - skip values that match defaults
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined) {
        if (DEFAULT_SEARCH_PARAMS[key] === value) return; // Skip if value matches default
        params.set(key, value.toString());
      }
    });
    
    // Hybrid config serialization — use memoized strings to avoid repeated JSON.stringify
    if (serializedHybridConfig !== serializedDefaultHybridConfig) {
      const encodedConfig = btoa(serializedHybridConfig);
      params.set('hybrid_config', encodedConfig);
    }
    
    // Update browser URL without reloading the page
    const url = new URL(window.location);
    url.search = params.toString();
    window.history.replaceState({}, '', url);
  }, [showScores, viewMode, gridSize, configCollapsed, showOnlyWithPreviews, selectedBackend, searchParams, serializedHybridConfig, serializedDefaultHybridConfig]);

  const deserializeFromURL = () => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Basic search parameters
    const query = urlParams.get('q');
    if (query) {
      setSearchQuery(query);
      setLastSearchQuery(query); // If loading from URL, treat this as the last search query
    }
    
    const img = urlParams.get('img');
    if (img) {
      // Retrieve actual base64 data from sessionStorage (avoids huge URL strings)
      const storedImage = sessionStorage.getItem('search_image_base64');
      if (storedImage) setImageBase64(storedImage);
    }
    
    const scores = urlParams.get('scores');
    if (scores === 'true') setShowScores(true);
    
    const view = urlParams.get('view');
    if (view) setViewMode(view);
    
    const gridSizeParam = urlParams.get('gridSize');
    if (gridSizeParam) setGridSize(gridSizeParam);
    
    const configOpen = urlParams.get('config_open');
    if (configOpen === 'true') setConfigCollapsed(false);
    
    const withPreviews = urlParams.get('with_previews');
    if (withPreviews === 'false') setShowOnlyWithPreviews(false);

    // Handle server parameter - only update if explicitly changing servers
    const serverParam = urlParams.get('server');
    if (serverParam && SERVER_MAPPING[serverParam] && !selectedBackend) {
      setSelectedBackend(serverParam);
    }
    
    // Search filters
    const newSearchParams = { ...searchParams };
    Object.keys(newSearchParams).forEach(key => {
      const value = urlParams.get(key);
      if (value !== null) {
        // Handle boolean values
        if (key === 'bbox_use_scaled_dimensions' || key === 'deduplicate_by_hash') {
          newSearchParams[key] = value === 'true';
        }
        // Handle numeric values
        else if (key === 'limit') {
          newSearchParams[key] = parseInt(value) || DEFAULT_SEARCH_PARAMS.limit;
        }
        // Handle string values
        else {
          newSearchParams[key] = value;
        }
      }
    });
    setSearchParams(newSearchParams);
    
    // Hybrid config deserialization
    const hybridConfigParam = urlParams.get('hybrid_config');
    if (hybridConfigParam) {
      try {
        const decodedConfig = JSON.parse(atob(hybridConfigParam));
        setHybridConfig(decodedConfig);
      } catch (error) {
        console.error('Error deserializing hybrid config from URL:', error);
      }
    }
    
    // Auto-search if we have search parameters
    return query || img; // Return true if we should auto-search
  };

  // Initialize from URL on component mount
  useEffect(() => {
    // Add a small delay to ensure all state is initialized
    const timer = setTimeout(() => {
      const hasAutoSearchParams = deserializeFromURL();
      setIsInitialized(true);
      
      // Set flag to trigger auto-search after state updates
      if (hasAutoSearchParams) {
        setShouldAutoSearch(true);
      }
    }, 100);
    
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-search when URL parameters are loaded and ready
  useEffect(() => {
    if (shouldAutoSearch && isInitialized && (searchQuery || imageBase64)) {
      // Add a small delay to ensure all state updates are fully applied
      const timer = setTimeout(() => {
        handleSearch();
        setShouldAutoSearch(false); // Reset flag
      }, 200);
      
      return () => clearTimeout(timer);
    }
  }, [shouldAutoSearch, isInitialized, searchQuery, imageBase64]);

  // Update URL when parameters change (only after initialization)
  // Note: searchQuery is excluded to avoid URL updates on every keystroke
  useEffect(() => {
    if (!isInitialized) return;
    
    const timeoutId = setTimeout(() => {
      serializeToURL();
    }, 300); // Debounce URL updates
    
    return () => clearTimeout(timeoutId);
  }, [
    isInitialized, 
    imageBase64, 
    showScores, 
    showOnlyWithPreviews,
    viewMode, 
    configCollapsed, 
    serializedSearchParams, // Memoized to avoid expensive JSON.stringify on every render
    serializedHybridConfig  // Memoized to avoid expensive JSON.stringify on every render
  ]);


  // Auth check
  useEffect(() => {
    const hasValidAuth = 
      (AUTH_CONFIG.ENABLE_NUCLEUS_AUTH && auth.nucleus_api_token) ||
      (AUTH_CONFIG.ENABLE_API_KEY_AUTH && auth.api_key) ||
      (AUTH_CONFIG.ENABLE_BASIC_AUTH && (auth.username !== "" && auth.password !== ""));

    const isAuthRequired = false; // Allow users to use navbar auth instead of modal

    if (hasValidAuth || !isAuthRequired) {
      setAuth(prev => ({ ...prev, isAuthenticated: (auth.username !== "" && auth.password !== "") }));
    } else if (isAuthRequired) {
      onWelcomeOpen();
    }
  }, []);

  // Fetch properties data and plugins info
  useEffect(() => {
    const fetchPropertiesData = async () => {
      try {
        // Only fetch if authenticated
        if (!auth.isAuthenticated) {
          return;
        }
        const headers = getHeaders();
        const response = await fetch(`${apiUrl}/search/stats/usd_properties`, {
          method: 'GET',
          headers: headers
        });
        const data = await response.json();
        setPropertiesData(data);
      } catch (error) {
        console.error("Error fetching property data", error);
      }
    };

    if (auth.isAuthenticated && !propertiesData) {
      fetchPropertiesData();
      fetchPluginsInfo();
      fetchBackendInfo();
    }
  }, [auth.isAuthenticated, propertiesData, selectedBackend]);

  // Update username based on backend type (only when initially loading, not when user clears)
  useEffect(() => {
    if (backend && localStorage.getItem("username") === null) {
      if (isNucleusBackend(backend)) {
        setAuth(prev => ({ ...prev, username: "$omni-api-token" }));
        // Set localStorage so we know it's been initialized
        localStorage.setItem("username", "$omni-api-token");
      } else if (isS3Backend(backend)) {
        setAuth(prev => ({ ...prev, username: "", password: "test" }));
        // Set localStorage so we know it's been initialized
        localStorage.setItem("username", "");
      }
    }
  }, [backend]);


  // Helper functions
  const getHeaders = useCallback(() => {
    const headers = { "Content-Type": "application/json" };

    // Add storage backend header if a backend is selected
    if (selectedBackend) {
      headers["x-usdsearch-storage-backend"] = selectedBackend;
    }

    // Get auth credentials via shared helper
    const serverAuth = readAuthCredentials(selectedBackend);

    // Only add auth headers if authentication is configured and available
    // Priority: API Key first (if explicitly set), then Basic Auth, then Nucleus
    if (serverAuth.api_key && serverAuth.api_key.trim() !== "") {
      headers["x-api-key"] = serverAuth.api_key;
    } else if (serverAuth.username && serverAuth.username.trim() !== "") {
      headers["Authorization"] = `Basic ${btoa(`${serverAuth.username}:${serverAuth.password || ""}`)}`;
    } else if (serverAuth.nucleus_api_token && serverAuth.nucleus_api_token.trim() !== "") {
      const basicAuth = btoa("$omni-api-token:" + serverAuth.nucleus_api_token);
      headers["Authorization"] = "Basic " + basicAuth;
    }
    
    return headers;
  }, [selectedBackend, readAuthCredentials]);


  const fetchPluginsInfo = async () => {
    try {
      setPlugins(prev => ({ ...prev, isLoading: true }));
      const headers = getHeaders();
      
      const response = await fetch(`${apiUrl}/info/plugins`, { headers });
      if (response.status === 200) {
        const data = await response.json();
        const activePlugins = [];
        const inactivePlugins = [];
        
        data.forEach(plugin => {
          if (plugin.name) {
            const pluginInfo = {
              name: plugin.name,
              active: plugin.active || false,
              description: plugin.description || null
            };
            
            if (pluginInfo.active) {
              activePlugins.push(pluginInfo);
            } else {
              inactivePlugins.push(pluginInfo);
            }
          }
        });
        
        setPlugins({
          active: activePlugins,
          inactive: inactivePlugins,
          isLoading: false
        });
      } else {
        setPlugins(prev => ({ ...prev, isLoading: false }));
      }
    } catch (err) {
      console.error("Error fetching plugins info:", err);
      setPlugins(prev => ({ ...prev, isLoading: false }));
    }
  };

  const fetchBackendInfo = async () => {
    try {
      const headers = getHeaders();
      
      const response = await fetch(`${apiUrl}/info/backend/storage`, { headers });
      if (response.status === 200) {
        const data = await response.json();
        setBackend(Object.keys(data.backends).join(', '));
      } else {
        // Backend info fetch returned non-200 status
      }
    } catch (err) {
      console.error("Error fetching backend info:", err);
    }
  };

  // Re-indexing functions
  const triggerReindexAllPlugins = useCallback(async (url) => {
    try {
      const headers = getHeaders();
      const params = new URLSearchParams();
      params.append('url', url);
      
      const response = await fetch(`${apiUrl}/process/asset?${params.toString()}`, {
        method: "GET",
        headers: headers
      });
      
      if (response.status === 401) {
        toast({
          title: t('loginRequired'),
          description: t('loginRequiredDescription'),
          status: "warning",
          duration: 8000,
          isClosable: true,
        });
      } else if (response.ok) {
        toast({
          title: t('reindexingStarted'),
          description: t('allPluginsReindex'),
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      console.error("Error triggering re-index:", err);
      toast({
        title: t('error'),
        description: t('failedTriggerReindex'),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  }, [apiUrl, getHeaders, toast, t]);

  const triggerReindexIndividualPlugin = useCallback(async (url, pluginName) => {
    try {
      const headers = getHeaders();
      const params = new URLSearchParams();
      params.append('url', url);
      params.append('plugins', pluginName);
      
      const response = await fetch(`${apiUrl}/process/asset?${params.toString()}`, {
        method: "GET",
        headers: headers
      });
      
      if (response.status === 401) {
        showUnauthorizedToast();
      } else if (response.ok) {
        toast({
          title: t('reindexingStarted'),
          description: t('pluginReindex', { pluginName }),
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      console.error("Error triggering plugin re-index:", err);
      toast({
        title: t('error'),
        description: t('failedPluginReindex', { pluginName }),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  }, [apiUrl, getHeaders, showUnauthorizedToast, toast, t]);

  // Refs for feedback state to remove from callback dependency arrays
  const feedbackDismissedRef = useRef(feedbackDismissed);
  feedbackDismissedRef.current = feedbackDismissed;
  const feedbackShownThisSessionRef = useRef(feedbackShownThisSession);
  feedbackShownThisSessionRef.current = feedbackShownThisSession;
  const showFeedbackPopupRef = useRef(showFeedbackPopup);
  showFeedbackPopupRef.current = showFeedbackPopup;

  // Helper function to handle feedback after successful search
  // Uses refs to avoid recreating callback when feedback state changes
  const handleSearchComplete = useCallback(() => {
    // Only handle feedback if feature is enabled
    if (!FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL) return;
    
    // Increment search counter using functional update
    setSearchCount(prev => {
      const newCount = prev + 1;
      localStorage.setItem('searchCount', newCount.toString());
      
      // Check if we should show feedback popup (only if not already shown in this session)
      if (newCount >= 10 && !feedbackDismissedRef.current && !feedbackShownThisSessionRef.current && !showFeedbackPopupRef.current) {
        setFeedbackShownThisSession(true);
        setShowFeedbackPopup(true);
      }
      return newCount;
    });
  }, []); // No dependencies — all state reads go through refs

  // Refs for values used in handleFindSimilar to reduce dependency chain
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const hybridConfigRef = useRef(hybridConfig);
  hybridConfigRef.current = hybridConfig;
  const embeddingConfigRef = useRef(embeddingConfig);
  embeddingConfigRef.current = embeddingConfig;

  const handleFindSimilar = useCallback(async (assetUrl) => {
    // Clear text search and set up image search using the asset URL
    setSearchQuery("");
    setLastSearchQuery(""); // Clear the last search query since this is a similarity search
    setImageBase64(""); // Clear any existing image
    
    // Store the asset information for display
    const filename = assetUrl?.split('/').pop() || 'Unknown Asset';
    setSimilarSearchAsset({
      url: assetUrl,
      filename: filename
    });
    
    // Read from refs to avoid dependency on frequently-changing values
    const currentSearchParams = searchParamsRef.current;
    const currentHybridConfig = hybridConfigRef.current;
    const currentEmbeddingConfig = embeddingConfigRef.current;
    
    // Trigger image search using the asset URL
    // We'll use the vector_queries with the asset URL instead of base64
    const requestBody = {
      limit: parseInt(currentSearchParams.limit),
      return_images: true,
      return_metadata: true,
      return_vision_generated_metadata: true,
      return_usd_properties: true,
      return_tags: true,
      
      // Hybrid search configuration
      scoring_config: currentHybridConfig,
      
      // Vector queries using asset URL for image similarity
      vector_queries: [{
        field_name: currentEmbeddingConfig.field_name,
        query_type: "image",
        query: assetUrl
      }],
      
      // Legacy filters
      ...Object.fromEntries(
        Object.entries(currentSearchParams).filter(([_, value]) => value !== "" && value !== null && value !== undefined)
      ),
    };

    // Clear existing results and start loading
    setIsLoading(true);
    setResults([]);
    
    // Clear active image requests to allow retries on new search
    const { clearActiveRequests } = await import('./utils/imageLoader');
    clearActiveRequests();
    
    // Update URL after state changes
    setTimeout(() => serializeToURL(), 0);

    // Perform the search
    fetch(`${apiUrl}/search_hybrid`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(requestBody),
    })
      .then(response => {
        if (response.status === 401) {
          toast({
            title: t('loginRequired'),
            description: t('loginRequiredDescription'),
            status: "warning",
            duration: 8000,
            isClosable: true,
          });
          setIsLoading(false);
          return Promise.reject(new Error('__auth_required__'));
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.hits) {
          setResults(data.hits);
        } else {
          setResults(data || []);
        }

        // Handle feedback popup after successful search
        handleSearchComplete();

        if (data.total === 0 || (Array.isArray(data) && data.length === 0)) {
          toast({
            title: t('noSimilarAssetsFound'),
            description: t('adjustSearchConfig'),
            status: "info",
            duration: 3000,
          });
        } else {
          toast({
            title: t('similarAssetsFound'),
            description: t('foundSimilarAssets', { count: data.hits?.length || data.length }),
            status: "success",
            duration: 3000,
          });
        }
      })
      .catch(error => {
        if (error.message === '__auth_required__') return; // Already handled above
        console.error("Similar search error:", error);
        toast({
          title: t('similarSearchFailed'),
          description: error.message,
          status: "error",
          duration: 5000,
        });
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [apiUrl, getHeaders, serializeToURL, handleSearchComplete, toast, t]);

  // Image handling
  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      // Reset the input value so re-selecting the same file still triggers onChange
      e.target.value = "";
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageBase64(event.target.result);
        setSimilarSearchAsset(null); // Auto-close similar search box when image is uploaded
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageBase64(event.target.result);
        setSimilarSearchAsset(null); // Auto-close similar search box when image is dropped
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  // Paste image from clipboard (triggered by right-click context menu)
  const handlePaste = useCallback(async (e) => {
    e.preventDefault();
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = (event) => {
            setImageBase64(event.target.result);
            setSimilarSearchAsset(null);
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
      // No image found in clipboard
      toast({
        title: t('pasteNoImage'),
        status: "warning",
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      toast({
        title: t('pasteFailed'),
        description: t('pasteFailedDescription'),
        status: "error",
        duration: 3000,
      });
    }
  }, [toast, t]);

  // Remove duplicates handler
  const handleRemoveDuplicatesChange = useCallback((e) => {
    const isChecked = e.target.checked;
    setSearchParams(prev => ({
      ...prev,
      deduplicate_by_hash: isChecked,
    }));
  }, []);

  const handleClearImage = useCallback(() => {
    setImageBase64("");
    setSimilarSearchAsset(null);
    sessionStorage.removeItem('search_image_base64');
  }, []);

  // Search handling
  const handleSearch = useCallback(async () => {
    const currentQuery = searchQueryRef.current;
    const currentImage = imageBase64Ref.current;
    const currentSearchParams = searchParamsRef.current;
    const currentHybridConfig = hybridConfigRef.current;
    const currentEmbeddingConfig = embeddingConfigRef.current;
    
    setIsLoading(true);
    setSimilarSearchAsset(null); // Clear similar search when doing regular search
    setLastSearchQuery(currentQuery); // Store the query being used for this search
    
    // Clear active image requests to allow retries on new search
    const { clearActiveRequests } = await import('./utils/imageLoader');
    clearActiveRequests();
    
    // Update URL with the current search parameters, but don't trigger a backend change
    serializeToURL();

    try {
      // Build the V3 API request
      const requestBody = {
        // Basic search parameters
        limit: parseInt(currentSearchParams.limit),
        return_images: true,
        return_metadata: true,
        return_vision_generated_metadata: true,
        return_usd_properties: true,
        return_tags: true,
        
        // Hybrid search configuration
        scoring_config: currentHybridConfig,
        
        // Main search query
        hybrid_text_query: currentQuery || null,
        
        // Vector queries (for image and text-to-vector search)
        vector_queries: (() => {
          const vectorQueries = [];
          
          // Add image vector query if present
          if (currentImage) {
            vectorQueries.push({
              field_name: currentEmbeddingConfig.field_name,
              query_type: "image",
              query: currentImage.split(",")[1] // Remove data URL prefix
            });
          }
          
          // Add text-to-vector queries if we have a text query
          if (currentQuery) {
            if (currentHybridConfig.vector_text_expansion?.enabled) {
              // With expansion enabled: send full query + individual words (avoid duplicates)
              const words = currentQuery.trim().split(/\s+/).filter(word => word.length > 0);
              
              // Always add the full query
              vectorQueries.push({
                field_name: currentEmbeddingConfig.field_name,
                query_type: "text",
                query: currentQuery
              });
              
              // Add individual words only if there are multiple words
              if (words.length > 1) {
                words.forEach(word => {
                  vectorQueries.push({
                    field_name: currentEmbeddingConfig.field_name,
                    query_type: "text",
                    query: word
                  });
                });
              }
            } else {
              // With expansion disabled: send only the full query
              vectorQueries.push({
                field_name: currentEmbeddingConfig.field_name,
                query_type: "text",
                query: currentQuery
              });
            }
          }
          
          return vectorQueries;
        })(),
        
        // Legacy filters
        ...Object.fromEntries(
          Object.entries(currentSearchParams).filter(([_, value]) => value !== "" && value !== null && value !== undefined)
        ),
      };

      // Remove empty or default values
      Object.keys(requestBody).forEach(key => {
        if (requestBody[key] === "" || requestBody[key] === null || requestBody[key] === undefined) {
          delete requestBody[key];
        }
      });

      const response = await fetch(`${apiUrl}/search_hybrid`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (response.status === 401) {
        toast({
          title: t('loginRequired'),
          description: t('loginRequiredDescription'),
          status: "warning",
          duration: 8000,
          isClosable: true,
        });
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Handle V3 response format
      if (data.hits) {
        setResults(data.hits);
      } else {
        // Fallback to V2 format if needed
        setResults(data || []);
      }

      // Handle feedback popup after successful search
      handleSearchComplete();

      if (data.total === 0 || (Array.isArray(data) && data.length === 0)) {
        toast({
          title: t('noResultsFound'),
          description: t('adjustSearchTerms'),
          status: "info",
          duration: 3000,
        });
      }

    } catch (error) {
      console.error("Search error:", error);
      toast({
        title: t('searchFailed'),
        description: error.message,
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, getHeaders, serializeToURL, handleSearchComplete, toast, t]);

  const handleFilterChange = useCallback((e) => {
    const { name, value } = e.target;
    setSearchParams(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setSearchParams({
      ...DEFAULT_SEARCH_PARAMS,
    });
  }, []);

  const handleItemClick = useCallback((item) => {
    setSelectedItem(item);
    onDetailsOpen();
  }, [onDetailsOpen]);

  // Feedback popup handlers (only if feature is enabled)
  const handleFeedbackLater = useCallback(() => {
    if (!FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL) return;
    setShowFeedbackPopup(false);
    setFeedbackShownThisSession(false); // Allow it to show again after more searches
    // Set counter to -15 so it will show again after 25 more searches (25 - 15 = 10)
    setSearchCount(prev => {
      const newCount = prev - 15;
      localStorage.setItem('searchCount', newCount.toString());
      return newCount;
    });
  }, []);

  const handleFeedbackDismiss = useCallback(() => {
    if (!FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL) return;
    setShowFeedbackPopup(false);
    setFeedbackDismissed(true);
    localStorage.setItem('feedbackDismissed', 'true');
  }, []);

  const handleFeedbackSubmit = useCallback(() => {
    if (!FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL) return;
    window.open('https://forms.gle/u2UnicMwyFDtFRZc9', '_blank');
    handleFeedbackDismiss();
  }, [handleFeedbackDismiss]);

  // Stable callback refs for search input to avoid re-renders
  const handleSearchRef = useRef(handleSearch);
  handleSearchRef.current = handleSearch;

  const onSearchInputChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  const onSearchInputKeyDown = useCallback((e) => {
    if (e.key === "Enter") handleSearchRef.current();
  }, []);

  // Stable callbacks for Switch/Toggle controls to avoid inline functions in JSX
  const onShowOnlyWithPreviewsChange = useCallback((e) => {
    setShowOnlyWithPreviews(e.target.checked);
  }, []);

  const onShowScoresChange = useCallback((e) => {
    setShowScores(e.target.checked);
  }, []);

  const onSetViewModeList = useCallback(() => setViewMode("list"), []);
  const onSetViewModeGrid = useCallback(() => setViewMode("grid"), []);
  const onToggleGridSize = useCallback(() => setGridSize(prev => prev === "L" ? "S" : "L"), []);

  const onSimilarSearchClear = useCallback(() => setSimilarSearchAsset(null), []);

  // Memoized active filter count for sidebar badge
  const activeFilterCount = useMemo(() => {
    return Object.entries(searchParams).filter(([key, value]) => {
      if (value === "" || value === null || value === undefined) return false;
      if (key in DEFAULT_SEARCH_PARAMS && value === DEFAULT_SEARCH_PARAMS[key]) return false;
      return true;
    }).length;
  }, [searchParams]);

  return (
    <Box minH="100vh" bg="#141517" color="white" p={4}>
      <VStack spacing={6} align="stretch" maxW="100%" mx="auto">
        {/* Main Search Area */}
        <VStack spacing={4} align="stretch">
          {/* Search Input + Image Preview Row */}
          <HStack align="center">
            <InputGroup size="lg" flex={1} minWidth="200px">
              <Input
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={onSearchInputChange}
                onKeyDown={onSearchInputKeyDown}
                bg="#1C1D20"
                borderColor="#383838"
                _hover={{ borderColor: "#FFD230" }}
                _focus={{ borderColor: "#FFD230", boxShadow: "0 0 0 1px #FFD230" }}
              />
              <InputRightElement>
                <SearchIcon color="gray.400" />
              </InputRightElement>
            </InputGroup>

            <Text color="gray.400" fontSize="sm" whiteSpace="nowrap">{t('or')}</Text>

            <Tooltip label={t('rightClickToPaste')} placement="bottom">
              <Button
                variant="outline"
                size="lg"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                minW="200px"
                color="gray.400"
                borderColor="#383838"
                _hover={{ borderColor: "#FFD230", color: "#FFD230" }}
              >
                {t('dragImageOrClick')}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  onContextMenu={handlePaste}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    cursor: "pointer",
                  }}
                />
              </Button>
            </Tooltip>

            <Button
              size="lg"
              bg="#FFD230"
              color="black"
              _hover={{ bg: "#F6C80F", transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(255,210,48,0.3)" }}
              _active={{ bg: "#D4A800" }}
              onClick={handleSearch}
              isLoading={isLoading}
              loadingText={t('searching')}
              leftIcon={<SearchIcon />}
              minW="120px"
              fontWeight="600"
            >
              {t('search')}
            </Button>
          </HStack>

          {/* Controls under search button */}
          <HStack justify="flex-end" spacing={8}>
            <FormControl display="flex" alignItems="center" size="sm" w="auto">
              <HStack spacing={1}>
                <FormLabel htmlFor="remove-duplicates" mb="0" fontSize="sm">
                  {t('removeDuplicates')}
                </FormLabel>
                <Tooltip label={t('removeDuplicatesHelp')} placement="top">
                  <InfoIcon color="gray.400" boxSize={3} />
                </Tooltip>
              </HStack>
              <Switch
                id="remove-duplicates"
                isChecked={searchParams.deduplicate_by_hash}
                onChange={handleRemoveDuplicatesChange}
                colorScheme="yellow"
                ml={3}
              />
            </FormControl>
            <FormControl display="flex" alignItems="center" size="sm" w="auto">
              <HStack spacing={1}>
                <FormLabel htmlFor="with-previews" mb="0" fontSize="sm">
                  {t('withPreviews')}
                </FormLabel>
                <Tooltip label={t('withPreviewsHelp')} placement="top">
                  <InfoIcon color="gray.400" boxSize={3} />
                </Tooltip>
              </HStack>
              <Switch
                id="with-previews"
                isChecked={showOnlyWithPreviews}
                onChange={onShowOnlyWithPreviewsChange}
                colorScheme="yellow"
                ml={3}
              />
            </FormControl>
            <FormControl display="flex" alignItems="center" size="sm" w="auto">
              <FormLabel htmlFor="show-scores" mb="0" fontSize="sm" mr={3}>
                {t('showScores')}
              </FormLabel>
              <Switch
                id="show-scores"
                isChecked={showScores}
                onChange={onShowScoresChange}
                colorScheme="yellow"
              />
            </FormControl>
            <FormControl display="flex" alignItems="center" size="sm" w="auto">
              <FormLabel htmlFor="view-mode" mb="0" fontSize="sm" mr={3}>
                {t('view')}
              </FormLabel>
              <HStack spacing={1} bg="gray.700" borderRadius="md" p={1}>
                <IconButton
                  size="xs"
                  variant={viewMode === "list" ? "solid" : "ghost"}
                  colorScheme={viewMode === "list" ? "yellow" : "gray"}
                  icon={<HamburgerIcon />}
                  onClick={onSetViewModeList}
                  aria-label={t('view')}
                />
                <IconButton
                  size="xs"
                  variant={viewMode === "grid" ? "solid" : "ghost"}
                  colorScheme={viewMode === "grid" ? "yellow" : "gray"}
                  icon={<ViewIcon />}
                  onClick={onSetViewModeGrid}
                  aria-label={t('view')}
                />
                {viewMode === "grid" && (
                  <IconButton
                    size="xs"
                    variant="ghost"
                    colorScheme="gray"
                    icon={gridSize === "L" ? <MinusIcon /> : <AddIcon />}
                    onClick={onToggleGridSize}
                    aria-label="Toggle grid size"
                    title={gridSize === "L" ? t('switchToCompactGrid') : t('switchToLargeGrid')}
                  />
                )}
              </HStack>
            </FormControl>
          </HStack>

          {/* Image Preview - positioned below controls row, right-aligned */}
          {imageBase64 && (
            <HStack justify="flex-end">
              <Box
                position="relative"
                bg="gray.800"
                border="1px solid"
                borderColor="gray.600"
                borderRadius="12px"
                p={3}
                transition="all 0.2s ease"
                _hover={{ borderColor: "#FFD230", boxShadow: "0 0 12px rgba(255, 210, 48, 0.15)" }}
                maxW="360px"
              >
                <HStack spacing={4} align="center">
                  {/* Image thumbnail */}
                  <Box
                    position="relative"
                    flexShrink={0}
                    borderRadius="8px"
                    overflow="hidden"
                    boxShadow="0 2px 8px rgba(0,0,0,0.4)"
                    bg="gray.900"
                  >
                    <Image
                      src={imageBase64}
                      alt="Search image"
                      w="120px"
                      h="90px"
                      objectFit="cover"
                    />
                    {/* Subtle gradient overlay */}
                    <Box
                      position="absolute"
                      bottom={0}
                      left={0}
                      right={0}
                      h="30%"
                      bgGradient="linear(to-t, blackAlpha.600, transparent)"
                      borderBottomRadius="8px"
                      pointerEvents="none"
                    />
                  </Box>

                  {/* Info section */}
                  <VStack align="start" spacing={2} flex={1} minW={0}>
                    <HStack spacing={2}>
                      <Box w="6px" h="6px" borderRadius="full" bg="#76E650" flexShrink={0} />
                      <Text fontSize="xs" color="#76E650" fontWeight="600" letterSpacing="0.5px" textTransform="uppercase">
                        {t('imageSearchActive')}
                      </Text>
                    </HStack>
                    <Text fontSize="xs" color="gray.400">
                      {t('imageUploadedHint')}
                    </Text>
                  </VStack>

                  {/* Close button */}
                  <IconButton
                    size="xs"
                    icon={<CloseIcon boxSize="8px" />}
                    onClick={handleClearImage}
                    aria-label="Remove image"
                    variant="ghost"
                    color="gray.400"
                    _hover={{ color: "white", bg: "whiteAlpha.200" }}
                    borderRadius="full"
                    position="absolute"
                    top={2}
                    right={2}
                  />
                </HStack>
              </Box>
            </HStack>
          )}

          {/* Similar Search Asset Preview */}
          {similarSearchAsset && (
            <Box
              position="relative"
              bg="gray.800"
              border="1px solid"
              borderColor="gray.600"
              borderRadius="12px"
              p={3}
              transition="all 0.2s ease"
              _hover={{ borderColor: "purple.400", boxShadow: "0 0 12px rgba(159, 122, 234, 0.15)" }}
              maxW="520px"
            >
              <HStack spacing={4} align="center">
                {/* Image thumbnail */}
                <Box
                  position="relative"
                  flexShrink={0}
                  borderRadius="8px"
                  overflow="hidden"
                  boxShadow="0 2px 8px rgba(0,0,0,0.4)"
                  bg="gray.900"
                >
                  <AssetImage
                    result={{ source: { base_key: similarSearchAsset.url } }}
                    getHeaders={getHeaders}
                    apiUrl={apiUrl}
                    width="120px"
                    height="90px"
                    borderRadius="0"
                  />
                  {/* Subtle gradient overlay */}
                  <Box
                    position="absolute"
                    bottom={0}
                    left={0}
                    right={0}
                    h="30%"
                    bgGradient="linear(to-t, blackAlpha.600, transparent)"
                    borderBottomRadius="8px"
                    pointerEvents="none"
                  />
                </Box>

                {/* Info section */}
                <VStack align="start" spacing={1.5} flex={1} minW={0}>
                  <HStack spacing={2}>
                    <Box w="6px" h="6px" borderRadius="full" bg="purple.400" flexShrink={0} />
                    <Text fontSize="xs" color="purple.400" fontWeight="600" letterSpacing="0.5px" textTransform="uppercase">
                      {t('findingSimilarTo')}
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color="gray.300" maxW="320px" noOfLines={2} title={similarSearchAsset.filename}>
                    {similarSearchAsset.filename}
                  </Text>
                  <Text fontSize="xs" color="gray.400" maxW="320px" noOfLines={1} fontFamily="mono" title={similarSearchAsset.url}>
                    {similarSearchAsset.url}
                  </Text>
                </VStack>

                {/* Close button */}
                <IconButton
                  size="xs"
                  icon={<CloseIcon boxSize="8px" />}
                  onClick={onSimilarSearchClear}
                  aria-label="Clear similar search"
                  variant="ghost"
                  color="gray.400"
                  _hover={{ color: "white", bg: "whiteAlpha.200" }}
                  borderRadius="full"
                  position="absolute"
                  top={2}
                  right={2}
                />
              </HStack>
            </Box>
          )}

        </VStack>

        {/* Main Content Grid */}
        <Grid templateColumns={(filtersCollapsed && configSidebarCollapsed) ? "auto 1fr" : "360px 1fr"} gap={6} align="start" minH="calc(100vh - 350px)">
          {/* Left Sidebar - Filters & Config as independent collapsible panels */}
          <GridItem>
            <VStack spacing={3} align="stretch" position="sticky" top="4">
              {/* === Search Filters Panel === */}
              {filtersCollapsed ? (
                <Box
                  bg="gray.800"
                  borderRadius="md"
                  py={3}
                  px={2}
                  w="34px"
                  border="1px solid"
                  borderColor="gray.600"
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="flex-start"
                  cursor="pointer"
                  onClick={() => setFiltersCollapsed(false)}
                  _hover={{ borderColor: "gray.400" }}
                  transition="border-color 0.2s"
                >
                  <VStack spacing={2}>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      icon={<ChevronRightIcon />}
                      aria-label="Show filters sidebar"
                      colorScheme="yellow"
                      pointerEvents="none"
                    />

                    {/* Show active filter count if any */}
                    {activeFilterCount > 0 && (
                        <Badge colorScheme="yellow" fontSize="xs" borderRadius="full" px={1} py={0.5}>
                          {activeFilterCount}
                        </Badge>
                    )}

                    {/* Vertical "Search Filters" Text */}
                    <Box
                      sx={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                      whiteSpace="nowrap"
                    >
                      <Text fontSize="xs" color="white" fontWeight="medium" letterSpacing="tight">
                        {t('searchFilters')}
                      </Text>
                    </Box>
                  </VStack>
                </Box>
              ) : (
                <VStack spacing={2} align="stretch">
                  <HStack justify="flex-end">
                    <Tooltip label={t('hideFilters')} placement="left">
                      <IconButton
                        size="sm"
                        variant="ghost"
                        icon={<ChevronLeftIcon />}
                        onClick={() => setFiltersCollapsed(true)}
                        aria-label="Hide filters sidebar"
                        colorScheme="gray"
                      />
                    </Tooltip>
                  </HStack>
                  <SearchFilters
                    searchParams={searchParams}
                    handleChange={handleFilterChange}
                    setSearchParams={setSearchParams}
                    propertiesData={propertiesData}
                    onClearAll={handleClearAllFilters}
                  />
                </VStack>
              )}

              {/* === Hybrid Search Config Panel === */}
              {configSidebarCollapsed ? (
                <Box
                  bg="gray.800"
                  borderRadius="md"
                  py={3}
                  px={2}
                  w="34px"
                  border="1px solid"
                  borderColor="gray.600"
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="flex-start"
                  cursor="pointer"
                  onClick={() => setConfigSidebarCollapsed(false)}
                  _hover={{ borderColor: "gray.400" }}
                  transition="border-color 0.2s"
                >
                  <VStack spacing={2}>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      icon={<ChevronRightIcon />}
                      aria-label="Show config sidebar"
                      colorScheme="yellow"
                      pointerEvents="none"
                    />

                    {/* Vertical "Search Config" Text */}
                    <Box
                      sx={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                      whiteSpace="nowrap"
                    >
                      <Text fontSize="xs" color="white" fontWeight="medium" letterSpacing="tight">
                        {t('advancedHybridConfig')}
                      </Text>
                    </Box>
                  </VStack>
                </Box>
              ) : (
                <VStack spacing={2} align="stretch">
                  <HStack justify="flex-end">
                    <Tooltip label={t('advancedHybridConfig')} placement="left">
                      <IconButton
                        size="sm"
                        variant="ghost"
                        icon={<ChevronLeftIcon />}
                        onClick={() => setConfigSidebarCollapsed(true)}
                        aria-label="Hide config sidebar"
                        colorScheme="gray"
                      />
                    </Tooltip>
                  </HStack>
                  <HybridSearchConfig
                    value={hybridConfig}
                    onChange={setHybridConfig}
                    isCollapsed={configCollapsed}
                    embeddingConfig={embeddingConfig}
                  />
                </VStack>
              )}
            </VStack>
          </GridItem>

          {/* Right Content - Results */}
          <GridItem>
            <MemoizedResults
              results={results}
              showOnlyWithPreviews={showOnlyWithPreviews}
              onItemClick={handleItemClick}
              copyToClipboard={copyToClipboard}
              onFindSimilar={handleFindSimilar}
              showScores={showScores}
              viewMode={viewMode}
              gridSize={gridSize}
              isLoading={isLoading}
              lastSearchQuery={lastSearchQuery}
              getHeaders={getHeaders}
              apiUrl={apiUrl}
              selectedItems={selectedItems}
              onSelectionChange={handleToggleSelection}
              onCopySelectedUrls={copySelectedUrls}
            />
          </GridItem>
        </Grid>
      </VStack>

      {/* Asset Details Modal */}
      {selectedItem && (
        <AssetDetailsModal
          isOpen={isDetailsOpen}
          onClose={onDetailsClose}
          selectedItem={selectedItem}
          copyToClipboard={copyToClipboard}
          showScores={showScores}
          plugins={plugins}
          getHeaders={getHeaders}
          apiUrl={apiUrl}
          triggerReindexAllPlugins={triggerReindexAllPlugins}
          triggerReindexIndividualPlugin={triggerReindexIndividualPlugin}
        />
      )}

      {/* Feedback Popup */}
      {FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL && showFeedbackPopup && (
        <Modal isOpen={showFeedbackPopup} onClose={() => {}} closeOnOverlayClick={false}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{t('helpUsImprove')}</ModalHeader>
            <ModalCloseButton onClick={handleFeedbackLater} />
            <ModalBody>
              <VStack spacing={4}>
                <Text>
                  {t('feedbackMessage')}
                </Text>
                <Text 
                  fontSize="xs" 
                  color="gray.500" 
                  textAlign="center" 
                  cursor="pointer" 
                  onClick={handleFeedbackDismiss}
                  _hover={{ color: "gray.400", textDecoration: "underline" }}
                >
                  {t('dontShowAgain')}
                </Text>
              </VStack>
            </ModalBody>
            <ModalFooter>
              <HStack spacing={3}>
                <Button variant="ghost" onClick={handleFeedbackLater}>
                  {t('later')}
                </Button>
                <Button bg="#FFD230" color="black" _hover={{ bg: "#F6C80F" }} onClick={handleFeedbackSubmit}>
                  {t('takeSurvey')}
                </Button>
              </HStack>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </Box>
  );
};

export default HybridDeepSearchUI;
