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

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, IconButton, Spinner } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { ImageWithSkeleton } from './ImageSkeleton';
import { loadImage, getCachedOffsets, loadProgressiveImages } from '../utils/imageLoader';

/**
 * Navigable asset image component with left-right arrow navigation
 * Supports img_offset parameter for viewing multiple images per asset
 */
const NavigableAssetImage = ({ 
  result,
  index,
  getHeaders,
  apiUrl,
  width = "100%",
  height = "120px",
  borderRadius = "md",
  ...imageProps 
}) => {
  const elementRef = useRef(null);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [imageData, setImageData] = useState(null);
  const [error, setError] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [maxOffset, setMaxOffset] = useState(null); // null means unknown, 0 means only one image
  const [isLoadingProgressive, setIsLoadingProgressive] = useState(false);
  const [hasAttemptedProgressive, setHasAttemptedProgressive] = useState(false);
  const [hasLoadingError, setHasLoadingError] = useState(false);
  
  const assetUrl = result?.source?.base_key || result?.source?.url || result?.id;

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
  useEffect(() => {
    loadCurrentImage(currentOffset);
  }, [currentOffset, loadCurrentImage]);

  // Handle case where we discover there's only one image and user is on a higher offset
  useEffect(() => {
    if (maxOffset === 0 && currentOffset > 0) {
      // Clear any error state from the failed higher offset and reset to offset 0
      setError(null);
      setHasLoadingError(false);
      setImageData(null); // Clear current image data to force reload
      setCurrentOffset(0);
      // The loadCurrentImage(0) will be triggered by the currentOffset change
    }
  }, [maxOffset, currentOffset]);

  // Progressive loading when user first navigates
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
        20, // Max parallel requests (use global limit)
        result // Pass result for vector image detection on offset 0
      );
      
      setMaxOffset(discoveredMax);
      
      // If no additional images found, we only have offset 0
      if (discoveredMax < 1) {
        setMaxOffset(0); // Only one image (offset 0)
      }
    } catch (err) {
      console.error('Progressive loading failed:', err);
      setMaxOffset(0); // Only one image (offset 0)
    } finally {
      setIsLoadingProgressive(false);
    }
  }, [assetUrl, getHeaders, apiUrl, isLoadingProgressive, hasAttemptedProgressive, result]);

  // Get available offsets from cache
  const effectiveApiUrl = apiUrl || '';
  const availableOffsets = getCachedOffsets(assetUrl || '', effectiveApiUrl);
  const canGoLeft = currentOffset > 0;
  
  // Determine if we can go right and if arrow should be shown
  let canGoRight = false;
  let showRightArrow = false;
  
  if (maxOffset === null && !hasAttemptedProgressive) {
    // Haven't attempted discovery yet, show enabled right arrow
    canGoRight = true;
    showRightArrow = true;
  } else if (maxOffset === null && hasAttemptedProgressive) {
    // Discovery in progress, check cache
    canGoRight = availableOffsets.includes(currentOffset + 1);
    showRightArrow = canGoRight;
  } else if (maxOffset !== null) {
    // Discovery complete
    if (maxOffset === 0) {
      // Single image case - show disabled right arrow if we're on offset 0
      canGoRight = false;
      showRightArrow = currentOffset === 0;
    } else {
      // Multiple images - normal navigation
      canGoRight = currentOffset < maxOffset;
      showRightArrow = canGoRight;
    }
  }

  // Navigation handlers
  const handlePrevious = useCallback(() => {
    if (!canGoLeft) return;
    const newOffset = currentOffset - 1;
    setCurrentOffset(newOffset);
  }, [canGoLeft, currentOffset]);

  const handleNext = useCallback(() => {
    if (!canGoRight) return;
    
    const newOffset = currentOffset + 1;
    setCurrentOffset(newOffset);
    
    // If this is the first navigation and we haven't attempted progressive loading, start it
    if (!hasAttemptedProgressive) {
      startProgressiveLoading();
    }
  }, [canGoRight, currentOffset, hasAttemptedProgressive, startProgressiveLoading]);

  // Determine what to display
  let src = null;
  let hasError = false;
  let errorMessage = "No Image";

  if (imageData) {
    src = imageData;
  } else if (result?.source?.image && currentOffset === 0 && !isLoading) {
    // Use fallback base64 image only for offset 0 if API failed and we're not loading
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

  const showNavigation = isHovered && (canGoLeft || showRightArrow);

  // === LM CUSTOMIZATION: SkeletonAspectRatioFix START ===
  // 修复"loading 时缩略图被压扁成一条线"：
  //   callsite 通过 style={{ aspectRatio: '16/9' }} 维持图片比例，但 style 会被 imageProps
  //   透传到内层 <img>。loading 阶段渲染的是 ImageSkeleton（不带 style，只能 height: 100%），
  //   外层 Box 又是 height: 'auto'，没有内容撑开 → Skeleton 高度塌成 0。
  //   解决：把 style.aspectRatio / style.minHeight 提升到外层容器，并在 height 为 'auto'
  //   时给一个最小高度兜底，确保 loading 也能撑出正确空间。
  const callerStyle = imageProps?.style || {};
  const outerAspectRatio = callerStyle.aspectRatio;
  const outerMinHeight = callerStyle.minHeight;
  const outerHeight = outerAspectRatio
    ? '100%'           // 由 aspectRatio 决定真实高度
    : height;
  // 合入英伟达新版时：保留本块；style 透传依然可用，外层只多解析两个字段
  // === LM CUSTOMIZATION: SkeletonAspectRatioFix END ===

  return (
    <Box 
      ref={elementRef}
      position="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      width={width}
      height={outerHeight}
      // === LM CUSTOMIZATION: SkeletonAspectRatioFix START ===
      sx={outerAspectRatio ? { aspectRatio: outerAspectRatio } : undefined}
      minHeight={outerMinHeight}
      // === LM CUSTOMIZATION: SkeletonAspectRatioFix END ===
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
        // 原因：默认 "ghost" variant 是 3 个跳动小灰点，视觉上更像 toast 而非图片占位；
        //       切换到 "shimmer"（横向流光），与 YouTube/Instagram/Fab.com 等主流图片占位惯例一致。
        // 合入英伟达新版时：如果上游引入了新的 skeleton 默认风格，按上游为准；本块可直接删除。
        skeletonProps={{
          variant: "shimmer"
        }}
        // === LM CUSTOMIZATION: SkeletonShimmerVariant END ===
        errorContent={errorMessage}
        {...imageProps}
      />
      
      {/* Navigation arrows - only visible on hover */}
      {showNavigation && (
        <>
          {/* Left arrow */}
          {canGoLeft && (
            <IconButton
              position="absolute"
              left="8px"
              top="50%"
              transform="translateY(-50%)"
              size="sm"
              icon={<ChevronLeftIcon />}
              onClick={(e) => {
                e.stopPropagation();
                handlePrevious();
              }}
              bg="rgba(0,0,0,0.7)"
              color="white"
              _hover={{ bg: "rgba(0,0,0,0.9)" }}
              aria-label="Previous image"
              isDisabled={isLoading}
            />
          )}
          
          {/* Right arrow */}
          {showRightArrow && (
            <IconButton
              position="absolute"
              right="8px"
              top="50%"
              transform="translateY(-50%)"
              size="sm"
              icon={<ChevronRightIcon />}
              onClick={(e) => {
                e.stopPropagation();
                if (canGoRight) {
                  handleNext();
                }
              }}
              bg="rgba(0,0,0,0.7)"
              color="white"
              _hover={{ bg: canGoRight ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.7)" }}
              aria-label="Next image"
              isDisabled={isLoading || !canGoRight}
              opacity={canGoRight ? 1 : 0.5}
            />
          )}
        </>
      )}
      
      {/* Image counter - show if we know there are multiple images, if we're not on offset 0, or if we have a single image after discovery */}
      {(maxOffset !== null && maxOffset >= 0) || currentOffset > 0 ? (
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
          {currentOffset + 1}{maxOffset !== null ? `/${maxOffset + 1}` : ''}
        </Box>
      ) : null}
      
      {/* Loading indicator for progressive loading */}
      {isLoadingProgressive && (
        <Box
          position="absolute"
          bottom="8px"
          left="8px"
          bg="rgba(0,0,0,0.7)"
          color="white"
          px={2}
          py={1}
          borderRadius="md"
          fontSize="xs"
          display="flex"
          alignItems="center"
          gap={1}
        >
          <Spinner size="xs" />
          Loading...
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
};

export default React.memo(NavigableAssetImage);