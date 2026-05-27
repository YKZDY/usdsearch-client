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
 * Image loader utility for fetching images from /v3/images API
 * Each URL is only attempted ONCE - no retries on any errors
 * Handles parallel downloads with global concurrency limiting
 */

import { getHighestScoringVectorImage } from './formatUtils';
import persistentCache from './persistentImageCache';

// Global configuration
const MAX_CONCURRENT_DOWNLOADS = 20;
const MAX_MEMORY_CACHE_SIZE = 150; // Max images in memory cache (LRU eviction)
const MAX_FAILED_URLS_SIZE = 500; // Max entries in failedUrls set

/**
 * LRU Cache for in-memory images.
 * Uses Map insertion order: newest entries are at the end.
 * When the cache exceeds MAX_MEMORY_CACHE_SIZE, the oldest entries are evicted.
 */
class LRUImageCache {
  constructor(maxSize = MAX_MEMORY_CACHE_SIZE) {
    this.maxSize = maxSize;
    this._map = new Map();
  }

  get(key) {
    const value = this._map.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this._map.delete(key);
      this._map.set(key, value);
    }
    return value;
  }

  set(key, value) {
    // If key already exists, delete first so re-insert puts it at end
    if (this._map.has(key)) {
      this._map.delete(key);
    }
    this._map.set(key, value);
    // Evict oldest entries if over limit
    while (this._map.size > this.maxSize) {
      const oldestKey = this._map.keys().next().value;
      this._map.delete(oldestKey);
    }
  }

  has(key) {
    return this._map.has(key);
  }

  delete(key) {
    return this._map.delete(key);
  }

  clear() {
    this._map.clear();
  }

  get size() {
    return this._map.size;
  }

  entries() {
    return this._map.entries();
  }

  keys() {
    return this._map.keys();
  }
}

// Global state
const imageCache = new LRUImageCache(MAX_MEMORY_CACHE_SIZE);
const activeRequests = new Map(); // Track in-flight requests to prevent duplicates
const failedUrls = new Set(); // Track URLs that have failed in this session to prevent retries

// Image download queue management
class ImageDownloadQueue {
  constructor(maxConcurrent = MAX_CONCURRENT_DOWNLOADS) {
    this.maxConcurrent = maxConcurrent;
    this.active = 0;
    this.queue = [];
  }

  async add(downloadFn, priority = false) {
    return new Promise((resolve, reject) => {
      const queueItem = { downloadFn, resolve, reject };
      
      if (priority) {
        // Add to front of queue for high priority items (visible images)
        this.queue.unshift(queueItem);
      } else {
        // Add to back of queue for normal priority items (buffer images)
        this.queue.push(queueItem);
      }
      
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const { downloadFn, resolve, reject } = this.queue.shift();
    this.active++;

    try {
      const result = await downloadFn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.active--;
      this.processQueue(); // Process next item in queue
    }
  }
}

// Global download queue instance
const downloadQueue = new ImageDownloadQueue();

/**
 * Cache utilities
 */
const buildApiUrl = (apiUrl, assetUrl, imgOffset = 0, vectorImageId = null) => {
  const params = new URLSearchParams();
  
  if (vectorImageId) {
    params.set('image_key', vectorImageId);
  } else {
    params.set('asset_url', assetUrl);
    if (imgOffset > 0) {
      params.set('img_offset', imgOffset.toString());
    }
  }
  
  return `${apiUrl}/images?${params.toString()}`;
};

const getCachedImage = async (cacheKey) => {
  // Check in-memory cache first (fastest)
  const memoryCache = imageCache.get(cacheKey);
  if (memoryCache) {
    return memoryCache;
  }
  
  // Check persistent cache with timeout
  try {
    const persistentPromise = persistentCache.get(cacheKey);
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1000)); // 1 second timeout
    const persistentResult = await Promise.race([persistentPromise, timeoutPromise]);
    
    if (persistentResult) {
      // Restore to in-memory cache for quick access
      imageCache.set(cacheKey, persistentResult);
      return persistentResult;
    }
  } catch (e) {
    console.warn('⚠️ Persistent cache error:', e.message);
  }
  
  return null;
};

const setCachedImage = async (cacheKey, imageData) => {
  // Only cache successful responses - don't store anything for errors
  if (!imageData) {
    return;
  }
  
  const cacheEntry = {
    data: imageData,
    error: null,
    timestamp: Date.now()
  };
  
  // Store in memory cache (synchronous)
  imageCache.set(cacheKey, cacheEntry);
  
  // Store in persistent cache (asynchronous, don't wait)
  persistentCache.set(cacheKey, imageData, null, 0).catch(err => {
    console.warn('Failed to store image in persistent cache:', err);
  });
};

/**
 * Fetches image from /v3/images API endpoint
 * @param {string} assetUrl - The asset URL to fetch image for
 * @param {Function} getHeaders - Function to get auth headers
 * @param {string} apiUrl - Base API URL
 * @param {number} imgOffset - Image offset (default 0)
 * @param {Object} result - Search result object (for vector image detection on offset 0)
 * @returns {Promise<string>} Base64 encoded image data URL
 */
const fetchImageFromAPI = async (url, getHeaders) => {
  // Check if this URL has already failed in this session
  if (failedUrls.has(url)) {
    const error = new Error(`URL previously failed in this session`);
    error.status = 404; // Treat as 404 to prevent further attempts
    throw error;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    // === LM CUSTOMIZATION: FailedUrlsOnlyFor404 START ===
    // 原因：只对 404 错误加入永久失败列表；临时性服务器错误（500/503 等）不应阻止后续重试，
    //       否则会导致多图资产偶发只显示部分预览图（如 11 张只显示 6 张）。
    // 合入英伟达新版时：保留本块
    if (response.status === 404) {
      failedUrls.add(url);
      // Prevent failedUrls from growing unbounded
      if (failedUrls.size > MAX_FAILED_URLS_SIZE) {
        const oldest = failedUrls.values().next().value;
        failedUrls.delete(oldest);
      }
    }
    // === LM CUSTOMIZATION: FailedUrlsOnlyFor404 END ===
    
    const error = new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to convert image to base64'));
    reader.readAsDataURL(blob);
  });
};

/**
 * Load image with caching and queue management - only tries once per URL+offset
 * @param {string} assetUrl - Asset URL to load image for
 * @param {Function} getHeaders - Function to get auth headers  
 * @param {string} apiUrl - Base API URL
 * @param {boolean} priority - Whether to prioritize this image (add to front of queue)
 * @param {number} imgOffset - Image offset (default 0)
 * @param {Object} result - Search result object (for vector image detection on offset 0)
 * @returns {Promise<string>} Promise resolving to base64 image data URL
 */
export const loadImage = async (assetUrl, getHeaders, apiUrl, priority = false, imgOffset = 0, result = null) => {
  if (!assetUrl) {
    throw new Error('Asset URL is required');
  }

  // Build request key for deduplication and caching
  let cacheKey;
  let shouldTryVector = false;
  
  // For offset 0, try vector image first if available
  if (imgOffset === 0 && result) {
    const vectorImageId = getHighestScoringVectorImage(result);
    if (vectorImageId) {
      cacheKey = buildApiUrl(apiUrl, assetUrl, imgOffset, vectorImageId);
      shouldTryVector = true;
    }
  }
  
  // If no vector image, use normal asset URL
  if (!shouldTryVector) {
    cacheKey = buildApiUrl(apiUrl, assetUrl, imgOffset);
  }

  // Check cache first
  const cached = await getCachedImage(cacheKey);
  if (cached && cached.data) {
    return cached.data;
  }

  // Check if this request is already in progress
  if (activeRequests.has(cacheKey)) {
    return activeRequests.get(cacheKey);
  }

  // Create the download promise
  const promise = (async () => {
    try {
      if (shouldTryVector) {
        try {
          const imageDataUrl = await fetchImageFromAPI(cacheKey, getHeaders);
          await setCachedImage(cacheKey, imageDataUrl);
          return imageDataUrl;
        } catch (error) {
          // Vector image failed, try normal asset call
          const normalCacheKey = buildApiUrl(apiUrl, assetUrl, imgOffset);
          
          // Check if normal image is already cached
          const normalCached = await getCachedImage(normalCacheKey);
          if (normalCached && normalCached.data) {
            return normalCached.data;
          }
          
          // Check if normal image request is already in progress
          if (activeRequests.has(normalCacheKey)) {
            return activeRequests.get(normalCacheKey);
          }
          
          // Add normal cache key to active requests to prevent other requests
          const normalPromise = (async () => {
            const imageDataUrl = await fetchImageFromAPI(normalCacheKey, getHeaders);
            await setCachedImage(normalCacheKey, imageDataUrl);
            return imageDataUrl;
          })();
          
          activeRequests.set(normalCacheKey, normalPromise);
          
          try {
            return await normalPromise;
          } finally {
            activeRequests.delete(normalCacheKey);
          }
        }
      } else {
        // Normal image call
        const imageDataUrl = await fetchImageFromAPI(cacheKey, getHeaders);
        await setCachedImage(cacheKey, imageDataUrl);
        return imageDataUrl;
      }
    } finally {
      activeRequests.delete(cacheKey);
    }
  })();

  activeRequests.set(cacheKey, promise);
  return promise;
};

/**
 * Preload multiple images in parallel
 * @param {string[]} assetUrls - Array of asset URLs to preload
 * @param {Function} getHeaders - Function to get auth headers
 * @param {string} apiUrl - Base API URL
 * @param {Function} onProgress - Optional progress callback (loaded, total)
 * @returns {Promise<Map<string, {data: string, error: Error}>>} Map of results
 */
export const preloadImages = async (assetUrls, getHeaders, apiUrl, onProgress = null) => {
  const results = new Map();
  let loaded = 0;
  
  const promises = assetUrls.map(async (assetUrl) => {
    try {
      const imageData = await loadImage(assetUrl, getHeaders, apiUrl);
      results.set(assetUrl, { data: imageData, error: null });
    } catch (error) {
      results.set(assetUrl, { data: null, error });
    } finally {
      loaded++;
      if (onProgress) {
        onProgress(loaded, assetUrls.length);
      }
    }
  });

  await Promise.allSettled(promises);
  return results;
};

/**
 * Progressive image loader that continuously tries offsets using full parallelism until 404
 * @param {string} assetUrl - Asset URL to load images for
 * @param {Function} getHeaders - Function to get auth headers
 * @param {string} apiUrl - Base API URL
 * @param {number} startOffset - Starting offset (default 1)
 * @param {number} maxParallel - Maximum parallel requests (uses global limit)
 * @param {Object} result - Search result object (for vector image detection on offset 0)
 * @returns {Promise<{images: Map<number, string>, maxOffset: number}>}
 */
export const loadProgressiveImages = async (assetUrl, getHeaders, apiUrl, startOffset = 1, maxParallel = MAX_CONCURRENT_DOWNLOADS, result = null) => {
  const images = new Map();
  
  // === LM CUSTOMIZATION: ClearStaleFailedUrls START ===
  // 原因：failedUrls 可能缓存了之前因 500 错误（已修复为只缓存 404）而被错误标记的 URL，
  //       在 progressive loading 开始时清除与当前资产相关的所有条目，确保重新尝试。
  // 合入英伟达新版时：保留本块
  const assetUrlEncoded = encodeURIComponent(assetUrl);
  for (const url of failedUrls) {
    if (url.includes(assetUrlEncoded) || url.includes(assetUrl)) {
      failedUrls.delete(url);
    }
  }
  // === LM CUSTOMIZATION: ClearStaleFailedUrls END ===
  
  // Always fetch offset 0 first (this will replace any existing cache entry with vector image if available)
  try {
    const offset0Image = await loadImage(assetUrl, getHeaders, apiUrl, false, 0, result);
    images.set(0, offset0Image);
  } catch (error) {
    // Offset 0 failed, but continue with other offsets
  }
  
  // === LM CUSTOMIZATION: ProgressiveLoadRobust START ===
  // 原因：并行探测会产生大量 404 报错（浏览器层面无法 suppress），严重污染控制台。
  //       改为顺序探测：逐个 offset 尝试，遇到第一个 404 立即停止。
  //       对单图资产：只产生 1 个 404；对多图资产（如 house.usd 11 张）：也只产生 1 个 404。
  //       虽然顺序加载稍慢，但本地代理延迟极低（<50ms/张），11 张约 500ms，用户体验可接受。
  // 合入英伟达新版时：保留本块
  
  // 顺序探测：逐个 offset 加载，遇到 404 立即停止
  let currentOffset = startOffset;
  const MAX_OFFSET_LIMIT = startOffset + 50; // 安全上限，防止无限循环
  
  while (currentOffset < MAX_OFFSET_LIMIT) {
    try {
      const imageData = await loadImage(assetUrl, getHeaders, apiUrl, false, currentOffset);
      images.set(currentOffset, imageData);
      currentOffset++;
    } catch (error) {
      // 遇到任何错误（404 或其他）都停止探测
      break;
    }
  }
  // === LM CUSTOMIZATION: ProgressiveLoadRobust END ===
  
  // Find the actual max offset from loaded images
  const loadedOffsets = Array.from(images.keys()).sort((a, b) => a - b);
  const maxOffset = loadedOffsets.length > 0 ? Math.max(...loadedOffsets) : startOffset - 1;
  
  return {
    images,
    maxOffset
  };
};

/**
 * Get all cached offsets for an asset URL (synchronous, only checks in-memory cache)
 * @param {string} assetUrl - Asset URL
 * @param {string} apiUrl - API base URL
 * @returns {number[]} Array of cached offset numbers
 */
export const getCachedOffsets = (assetUrl, apiUrl = '') => {
  const offsets = [];
  
  // Only check in-memory cache for performance (this is used for UI state)
  for (const [cacheKey, value] of imageCache.entries()) {
    // Check if this cache key is for the given assetUrl
    try {
      const url = new URL(cacheKey);
      const params = new URLSearchParams(url.search);
      
      if (params.get('asset_url') === assetUrl) {
        const imgOffset = parseInt(params.get('img_offset') || '0', 10);
        offsets.push(imgOffset);
      }
    } catch (e) {
      // Ignore malformed URLs
    }
  }
  
  return offsets.sort((a, b) => a - b);
};

/**
 * Clear active requests and failed URLs to allow retries on new searches
 */
export const clearActiveRequests = () => {
  activeRequests.clear();
  failedUrls.clear();
};

/**
 * Clear image cache (both in-memory and persistent)
 */
export const clearImageCache = async () => {
  imageCache.clear();
  await persistentCache.clear();
};

/**
 * Get cache stats for debugging
 */
export const getCacheStats = async () => {
  const persistentStats = await persistentCache.getStats();
  
  return {
    memory: {
      size: imageCache.size,
      activeDownloads: downloadQueue.active,
      queueLength: downloadQueue.queue.length
    },
    persistent: persistentStats
  };
};