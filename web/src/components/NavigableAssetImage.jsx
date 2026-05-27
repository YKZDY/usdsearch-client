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

import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Box, Spinner } from '@chakra-ui/react';
import { ImageWithSkeleton } from './ImageSkeleton';
import { loadImage, getCachedOffsets, loadProgressiveImages } from '../utils/imageLoader';
// === LM CUSTOMIZATION: ImageStateStore START ===
import { setImageState } from '../utils/imageStateStore';
// === LM CUSTOMIZATION: ImageStateStore END ===

// === LM CUSTOMIZATION: HoverZoneNavigation START ===
// 原因：将左右箭头导航升级为 hover 分区切换 + 圆点指示器，
//       与 Fab.com / ArtStation 等主流资产平台的标准交互一致。
// 合入英伟达新版时：保留本块；如果上游改动了 NavigableAssetImage 的导航逻辑，
//       需要对比合并，优先保留 hover 分区方案。

/** 品牌金色（LA 主题） */
const BRAND_PRIMARY = '#FFD230';

/**
 * Navigable asset image component with hover-zone navigation and dot indicators
 * Supports img_offset parameter for viewing multiple images per asset
 */
const NavigableAssetImage = forwardRef(({ 
  result,
  index,
  getHeaders,
  apiUrl,
  width = "100%",
  height = "120px",
  borderRadius = "md",
  onOffsetChange,
  onProgressiveLoadComplete,
  onCurrentImageChange, // 通知父组件当前展示的图片 data URL（供相似搜索使用）
  onFindSimilar, // 可选：hover 时在图片上显示"查找相似"按钮
  findSimilarTooltip = '查找相似资产', // tooltip 文案（支持 i18n）
  initialOffset = 0,
  ...imageProps 
}, ref) => {
  const elementRef = useRef(null);
  const [currentOffset, setCurrentOffset] = useState(initialOffset);
  const [isLoading, setIsLoading] = useState(false);
  const [imageData, setImageData] = useState(null);
  const [error, setError] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [maxOffset, setMaxOffset] = useState(null); // null means unknown, 0 means only one image
  const [isLoadingProgressive, setIsLoadingProgressive] = useState(false);
  const [hasAttemptedProgressive, setHasAttemptedProgressive] = useState(false);
  const [hasLoadingError, setHasLoadingError] = useState(false);
  // 存储所有已加载图片的 data URL（按 offset 索引）
  const [loadedImages, setLoadedImages] = useState(new Map());
  
  const assetUrl = result?.source?.base_key || result?.source?.url || result?.id;

  // === LM CUSTOMIZATION: ImperativeHandle START ===
  // 备用方案：通过 ref 暴露 getState()。注意：在虚拟列表 + React.memo 环境下 ref 可能不可靠，
  // 主要方案已改为通过 onOffsetChange / onCurrentImageChange 回调实时同步状态。
  // 合入英伟达新版时：保留本块
  useImperativeHandle(ref, () => ({
    getState: () => ({
      currentOffset,
      imageData,
      assetUrl,
    }),
  }), [currentOffset, imageData, assetUrl]);
  // === LM CUSTOMIZATION: ImperativeHandle END ===

  // 通知父组件 offset 变化（保留向后兼容，但不再是核心依赖）
  const onOffsetChangeRef = useRef(onOffsetChange);
  const onCurrentImageChangeRef = useRef(onCurrentImageChange);
  useEffect(() => { onOffsetChangeRef.current = onOffsetChange; }, [onOffsetChange]);
  useEffect(() => { onCurrentImageChangeRef.current = onCurrentImageChange; }, [onCurrentImageChange]);

  useEffect(() => {
    if (onOffsetChangeRef.current) {
      onOffsetChangeRef.current(currentOffset);
    }
    // === LM CUSTOMIZATION: ImageStateStore START ===
    // 同步写入全局 Map（不依赖 React 组件树传递，100% 可靠）
    // 当 imageData 为 null 且 offset=0 时，使用 result.source.image 构造 base64
    let effectiveSrc = imageData;
    if (!effectiveSrc && currentOffset === 0 && result?.source?.image) {
      effectiveSrc = `data:image/png;base64,${result.source.image}`;
    }
    setImageState(assetUrl, currentOffset, effectiveSrc);
    // === LM CUSTOMIZATION: ImageStateStore END ===
  }, [currentOffset, imageData, assetUrl, result?.source?.image]);

  useEffect(() => {
    if (onCurrentImageChangeRef.current && imageData) {
      onCurrentImageChangeRef.current(imageData);
    }
    // === LM CUSTOMIZATION: ImageStateStore START ===
    // imageData 变化时也同步更新全局 Map
    if (imageData) {
      setImageState(assetUrl, currentOffset, imageData);
    }
    // === LM CUSTOMIZATION: ImageStateStore END ===
  }, [imageData, assetUrl, currentOffset]);

  // Load image for current offset
  const loadCurrentImage = useCallback(async (offset) => {
    if (!assetUrl || !getHeaders) return;
    
    setIsLoading(true);
    setError(null);
    setHasLoadingError(false);
    
    try {
      const effectiveApiUrl = apiUrl || '';
      // Pass the result object only for offset 0 to enable vector image detection
      const resultForVectorDetection = offset === 0 ? result : null;
      const data = await loadImage(assetUrl, getHeaders, effectiveApiUrl, false, offset, resultForVectorDetection);
      setImageData(data);
      // 缓存到 loadedImages
      setLoadedImages(prev => {
        const next = new Map(prev);
        next.set(offset, data);
        return next;
      });
    } catch (err) {
      setError(err);
      setImageData(null);
      // Set loading error state for non-404 errors
      if (err.status && err.status !== 404) {
        setHasLoadingError(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [assetUrl, getHeaders, apiUrl, result]);

  // Load image when currentOffset changes (including initial load at offset 0)
  // 优化：如果 loadedImages 中有缓存，直接使用缓存（避免异步加载延迟导致 imageData 不同步）
  useEffect(() => {
    const cached = loadedImages.get(currentOffset);
    if (cached) {
      setImageData(cached);
      setIsLoading(false);
      setError(null);
      setHasLoadingError(false);
    } else {
      loadCurrentImage(currentOffset);
    }
  }, [currentOffset, loadCurrentImage, loadedImages]);

  // Handle case where we discover there's only one image and user is on a higher offset
  useEffect(() => {
    if (maxOffset === 0 && currentOffset > 0) {
      setError(null);
      setHasLoadingError(false);
      setImageData(null);
      setCurrentOffset(0);
    }
  }, [maxOffset, currentOffset]);

  // Progressive loading when user first hovers (for multi-image discovery)
  const startProgressiveLoading = useCallback(async () => {
    if (!assetUrl || !getHeaders || isLoadingProgressive || hasAttemptedProgressive) return;
    
    setIsLoadingProgressive(true);
    setHasAttemptedProgressive(true);
    
    try {
      const effectiveApiUrl = apiUrl || '';
      const { images, maxOffset: discoveredMax } = await loadProgressiveImages(
        assetUrl, 
        getHeaders, 
        effectiveApiUrl,
        1, // Start from offset 1
        5, // 适中并行度：快速发现多图资产，同时限制单图资产的无用 404 请求
        result // Pass result for vector image detection on offset 0
      );
      
      setMaxOffset(discoveredMax);
      
      // 缓存所有已加载的图片
      setLoadedImages(prev => {
        const next = new Map(prev);
        for (const [offset, data] of images.entries()) {
          next.set(offset, data);
        }
        return next;
      });

      // 通知父组件 progressive loading 完成
      if (onProgressiveLoadComplete) {
        const allImages = new Map(loadedImages);
        for (const [offset, data] of images.entries()) {
          allImages.set(offset, data);
        }
        onProgressiveLoadComplete(allImages, discoveredMax);
      }
      
      // If no additional images found, we only have offset 0
      if (discoveredMax < 1) {
        setMaxOffset(0);
      }
    } catch (err) {
      console.error('Progressive loading failed:', err);
      setMaxOffset(0);
    } finally {
      setIsLoadingProgressive(false);
    }
  }, [assetUrl, getHeaders, apiUrl, isLoadingProgressive, hasAttemptedProgressive, result, onProgressiveLoadComplete, loadedImages]);

  // 延迟触发 progressive loading：hover 600ms 后才开始，避免快速扫过时触发大量无用请求
  const progressiveTimerRef = useRef(null);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (!hasAttemptedProgressive) {
      // 延迟 600ms 触发，如果鼠标在此期间离开则取消
      progressiveTimerRef.current = setTimeout(() => {
        startProgressiveLoading();
      }, 600);
    }
  }, [hasAttemptedProgressive, startProgressiveLoading]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    // 取消未触发的 progressive loading 定时器
    if (progressiveTimerRef.current) {
      clearTimeout(progressiveTimerRef.current);
      progressiveTimerRef.current = null;
    }
    // 需求 1.5：离开卡片时保持当前浏览位置（不重置）
  }, []);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (progressiveTimerRef.current) {
        clearTimeout(progressiveTimerRef.current);
      }
    };
  }, []);

  // Hover 分区切换逻辑：鼠标水平位置决定当前 offset
  const handleMouseMove = useCallback((e) => {
    if (maxOffset === null || maxOffset <= 0) return; // 单图或未知不处理
    
    const rect = elementRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const relativeX = e.clientX - rect.left;
    const zoneWidth = rect.width / (maxOffset + 1);
    const zoneIndex = Math.min(
      Math.floor(relativeX / zoneWidth),
      maxOffset
    );
    
    if (zoneIndex !== currentOffset && zoneIndex >= 0) {
      setCurrentOffset(zoneIndex);
    }
  }, [maxOffset, currentOffset]);

  // Get available offsets from cache
  const effectiveApiUrl = apiUrl || '';
  const availableOffsets = getCachedOffsets(assetUrl || '', effectiveApiUrl);

  // Determine what to display
  let src = null;
  let hasError = false;
  let errorMessage = "No Image";

  if (imageData) {
    src = imageData;
  } else if (result?.source?.image && currentOffset === 0 && !isLoading) {
    src = `data:image/png;base64,${result.source.image}`;
  } else if (error && !result?.source?.image) {
    hasError = true;
    
    if (error.status === 404) {
      errorMessage = currentOffset === 0 ? "Image Not Found" : "No More Images";
    } else if (error.status === 403) {
      errorMessage = "Access Denied";
    } else if (error.status >= 400 && error.status < 500) {
      errorMessage = "Invalid Request";
    } else if (error.status >= 500) {
      errorMessage = "Server Error";
    } else {
      errorMessage = "Load Failed";
    }
  }

  // 是否显示多图 UI（圆点指示器）— progressive loading 完成后才显示计数器
  const showDots = maxOffset !== null && maxOffset > 0 && !isLoadingProgressive;
  const totalImages = maxOffset !== null ? maxOffset + 1 : 1;

  // === LM CUSTOMIZATION: SkeletonAspectRatioFix START ===
  const callerStyle = imageProps?.style || {};
  const outerAspectRatio = callerStyle.aspectRatio;
  const outerMinHeight = callerStyle.minHeight;
  const outerHeight = outerAspectRatio ? '100%' : height;
  // === LM CUSTOMIZATION: SkeletonAspectRatioFix END ===

  return (
    <Box 
      ref={elementRef}
      position="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      width={width}
      height={outerHeight}
      // === LM CUSTOMIZATION: SkeletonAspectRatioFix START ===
      sx={outerAspectRatio ? { aspectRatio: outerAspectRatio } : undefined}
      minHeight={outerMinHeight}
      // === LM CUSTOMIZATION: SkeletonAspectRatioFix END ===
      cursor={showDots ? 'pointer' : 'default'}
    >
      <ImageWithSkeleton
        src={src}
        alt="Asset thumbnail"
        isLoading={isLoading && !result?.source?.image}
        hasError={hasError}
        width="100%"
        height="100%"
        borderRadius={borderRadius}
        objectFit="cover"
        // === LM CUSTOMIZATION: SkeletonShimmerVariant START ===
        skeletonProps={{
          variant: "shimmer"
        }}
        // === LM CUSTOMIZATION: SkeletonShimmerVariant END ===
        errorContent={errorMessage}
        {...imageProps}
      />
      
      {/* 底部圆点指示器 — 仅多图 + hover 时显示 */}
      {showDots && isHovered && (
        <Box
          position="absolute"
          bottom="8px"
          left="50%"
          transform="translateX(-50%)"
          display="flex"
          alignItems="center"
          gap="4px"
          bg="rgba(0,0,0,0.5)"
          px="8px"
          py="4px"
          borderRadius="999px"
          pointerEvents="none"
          aria-label={`${currentOffset + 1}/${totalImages}`}
        >
          {Array.from({ length: totalImages }, (_, i) => (
            <Box
              key={i}
              width={i === currentOffset ? "8px" : "6px"}
              height={i === currentOffset ? "8px" : "6px"}
              borderRadius="50%"
              bg={i === currentOffset ? BRAND_PRIMARY : 'rgba(255,255,255,0.5)'}
              transition="all 0.15s ease"
              transform={i === currentOffset ? "scale(1.1)" : "scale(1)"}
            />
          ))}
        </Box>
      )}

      {/* 图片计数器 — 非 hover 时显示（如果已知多图且 loading 完成） */}
      {showDots && !isHovered && (
        <Box
          position="absolute"
          top="8px"
          right="8px"
          bg="rgba(0,0,0,0.7)"
          color="white"
          px={2}
          py={1}
          borderRadius="md"
          fontSize="xs"
          fontWeight="bold"
        >
          {currentOffset + 1}/{totalImages}
        </Box>
      )}

      {/* === LM CUSTOMIZATION: FindSimilarOverlay REMOVED === */}
      {/* 已移除图片上的"查找相似"按钮 — 卡片底部已有该功能，无需重复 */}

      {/* 单图发现完成后不显示任何导航 UI（需求 1.2） */}
      
      {/* Progressive loading 指示器 — 延迟 300ms 后才显示，避免快速完成时的闪烁 */}
      {isLoadingProgressive && isHovered && (
        <Box
          position="absolute"
          bottom={showDots ? "28px" : "8px"}
          left="50%"
          transform="translateX(-50%)"
          display="flex"
          alignItems="center"
          gap="4px"
          bg="rgba(0,0,0,0.6)"
          px="8px"
          py="3px"
          borderRadius="999px"
          pointerEvents="none"
          fontSize="xs"
          color="white"
          sx={{ animation: 'fadeIn 0.3s ease 0.3s both', '@keyframes fadeIn': { from: { opacity: 0 }, to: { opacity: 1 } } }}
        >
          <Spinner size="xs" color={BRAND_PRIMARY} />
        </Box>
      )}
      
      {/* Error indicator for non-404 errors */}
      {hasLoadingError && (
        <Box
          position="absolute"
          bottom="8px"
          left="8px"
          bg="rgba(139,0,0,0.7)"
          color="white"
          px={2}
          py={1}
          borderRadius="md"
          fontSize="xs"
        >
          Error loading images
        </Box>
      )}
    </Box>
  );
});

// === LM CUSTOMIZATION: HoverZoneNavigation END ===

export default React.memo(NavigableAssetImage);