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

import { useState, useEffect, useRef } from 'react';
import { loadImage } from '../utils/imageLoader';

/**
 * Custom hook for loading images with state management
 * @param {string} assetUrl - Asset URL to load image for
 * @param {Function} getHeaders - Function to get auth headers
 * @param {string} apiUrl - Base API URL
 * @param {boolean} enabled - Whether to start loading immediately
 * @returns {Object} - { imageData, isLoading, error }
 */
export const useImageLoader = (assetUrl, getHeaders, apiUrl, enabled = true) => {
  // === LM CUSTOMIZATION: ImageLoaderStaleFix START ===
  // 修复 R-C：原实现有两个核心 bug 导致 Drawer 切换卡片时缩略图 stale：
  //   1. attemptedUrls = useState(new Set()) 永久累积，同 URL 二次访问直接 return，
  //      不重置 imageData → UI 继续显示上次的图。
  //   2. assetUrl 变化时未先清空 imageData → React 重渲染时 ImageWithSkeleton 看到
  //      旧 imageData + isLoading=true 仍可能显示旧图（取决于 ImageWithSkeleton 实现）。
  //   3. 无网络竞态保护 → 快速切换多张卡片时旧请求晚返回会覆盖新请求结果。
  // 修复方案：
  //   - 去掉 attemptedUrls Set，依赖 React 自带的 strict mode + AbortController 防重复
  //   - assetUrl 变化先立即 setImageData(null) + setError(null) + setIsLoading(true)
  //   - AbortController 在 cleanup 阶段 abort，防止旧请求异步覆盖新数据
  //   - getHeaders / apiUrl 走 ref 不进 deps（避免父组件重渲染触发不必要重载）
  // 合入英伟达新版时：本块替换原版整个 useImageLoader 实现。原版 bug 在快速切换场景
  //   就会出现 stale，建议向上游提 PR 或保留本修复版。
  const [imageData, setImageData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // 把 getHeaders / apiUrl 装在 ref 里，避免成为 deps
  const getHeadersRef = useRef(getHeaders);
  const apiUrlRef = useRef(apiUrl);
  useEffect(() => { getHeadersRef.current = getHeaders; }, [getHeaders]);
  useEffect(() => { apiUrlRef.current = apiUrl; }, [apiUrl]);

  useEffect(() => {
    if (!assetUrl || !enabled) {
      // 没有 url 或被禁用：清干净状态
      setImageData(null);
      setIsLoading(false);
      setError(null);
      return undefined;
    }

    const headers = getHeadersRef.current;
    if (!headers) {
      return undefined;
    }

    // 切换到新 URL：立即清空旧数据，进入 loading 态
    // 这样 ImageWithSkeleton 会显示加载占位而非旧图（用户能立即感知"在切换"）
    let cancelled = false;
    setImageData(null);
    setError(null);
    setIsLoading(true);

    const effectiveApiUrl = apiUrlRef.current || '';

    loadImage(assetUrl, headers, effectiveApiUrl)
      .then((data) => {
        if (cancelled) return;
        setImageData(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setImageData(null);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    // cleanup：assetUrl 变化或卸载时 abort 旧请求结果
    // 这里不真去 abort fetch（loadImage 没 AbortController 接口），
    // 而是用 cancelled 标志位让旧 promise 的 then/catch 不再 setState，
    // 避免快速切换时旧请求结果覆盖新请求结果（竞态）。
    return () => {
      cancelled = true;
    };
  }, [assetUrl, enabled]);
  // === LM CUSTOMIZATION: ImageLoaderStaleFix END ===

  return {
    imageData,
    isLoading,
    error
  };
};

/**
 * Hook for managing multiple image loads
 * @param {string[]} assetUrls - Array of asset URLs
 * @param {Function} getHeaders - Function to get auth headers
 * @param {string} apiUrl - Base API URL
 * @returns {Object} - { images: Map, loadingStates: Map, errors: Map, progress }
 */
export const useMultipleImageLoader = (assetUrls, getHeaders, apiUrl) => {
  const [images, setImages] = useState(new Map());
  const [loadingStates, setLoadingStates] = useState(new Map());
  const [errors, setErrors] = useState(new Map());
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });

  useEffect(() => {
    if (!assetUrls || assetUrls.length === 0) {
      setImages(new Map());
      setLoadingStates(new Map());
      setErrors(new Map());
      setProgress({ loaded: 0, total: 0 });
      return;
    }

    // Initialize loading states
    const initialLoadingStates = new Map();
    assetUrls.forEach(url => {
      if (url) {
        initialLoadingStates.set(url, true);
      }
    });
    setLoadingStates(initialLoadingStates);
    setProgress({ loaded: 0, total: assetUrls.filter(Boolean).length });

    // Load all images
    const loadPromises = assetUrls
      .filter(Boolean)
      .map(async (assetUrl) => {
        try {
          const imageData = await loadImage(assetUrl, getHeaders, apiUrl);
          
          // Update state atomically
          setImages(prev => new Map(prev).set(assetUrl, imageData));
          setLoadingStates(prev => new Map(prev).set(assetUrl, false));
          setProgress(prev => ({ ...prev, loaded: prev.loaded + 1 }));
          
        } catch (error) {
          console.error(`Failed to load image for ${assetUrl}:`, error);
          
          setErrors(prev => new Map(prev).set(assetUrl, error));
          setLoadingStates(prev => new Map(prev).set(assetUrl, false));
          setProgress(prev => ({ ...prev, loaded: prev.loaded + 1 }));
        }
      });

    // Wait for all images to complete (success or failure)
    Promise.allSettled(loadPromises);

  }, [assetUrls, getHeaders, apiUrl]);

  return {
    images,
    loadingStates,
    errors,
    progress
  };
};