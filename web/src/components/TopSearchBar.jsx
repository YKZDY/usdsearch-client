// === LM CUSTOMIZATION: Top search bar for Fab-style header ===
// 全新文件，零合并风险
// 胶囊形搜索框，居中放置在顶栏中
// 通过 CustomEvent 与 HybridDeepSearchUI 双向通信
// v2（2026-04-29）：集成图片上传到搜索框内部，相机图标 + 缩略图预览

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import { useFilterMemory } from '../hooks/useFilterMemory';
import { flushPending as flushPendingReindex } from '../services/reindexService';
import './TopSearchBar.css';

function TopSearchBar({ style }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [imagePreview, setImagePreview] = useState(null); // base64 缩略图
  const [isDragging, setIsDragging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1); // 键盘导航索引
  const fileInputRef = useRef(null);
  const barRef = useRef(null);
  const historyRef = useRef(null);
  const inputRef = useRef(null);

  // 搜索历史记忆
  const { memories: searchHistory, addMemory: addSearchHistory, removeMemory: removeSearchHistory, clearAll: clearSearchHistory } = useFilterMemory('search');

  // 同步：当 HybridDeepSearchUI 的 searchQuery 变化时更新本地输入框。
  // v3 解耦版：顶层只会在"用户按下搜索/点清除/重置"等显式场景 setSearchQuery，
  // 分类点击 / 标签勾选等操作已不再写 searchQuery，因此不会再被动填字干扰用户输入。
  useEffect(() => {
    const handleSync = (e) => setQuery(e.detail?.query || '');
    window.addEventListener('search-query-synced', handleSync);
    return () => window.removeEventListener('search-query-synced', handleSync);
  }, []);

  // 同步：当 HybridDeepSearchUI 图片状态变化时更新预览
  useEffect(() => {
    const handleImageSync = (e) => {
      setImagePreview(e.detail?.imageBase64 || null);
    };
    window.addEventListener('image-state-synced', handleImageSync);
    // 挂载时主动请求当前图片状态（解决组件挂载顺序导致的时序问题）
    window.dispatchEvent(new Event('request-image-state'));
    return () => window.removeEventListener('image-state-synced', handleImageSync);
  }, []);

  const handleSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed) {
      addSearchHistory(trimmed, trimmed);
    }
    setShowHistory(false);
    setHistoryIndex(-1);
    // [TagSearchFix P11] 用户主动搜索时，立即 flush 挂起的 reindex debounce 队列。
    // 避免"刚打 tag 还没到 3500ms debounce 触发就搜索"导致 ES 仍未刷新的时序竞争。
    try { flushPendingReindex(); } catch (_) { /* noop */ }
    window.dispatchEvent(new CustomEvent('top-search-query-changed', {
      detail: { query }
    }));
    window.dispatchEvent(new Event('trigger-search'));
    // === LM CUSTOMIZATION: Search/Tag decoupling v4 — 回车后文字保留 + 自动全选（Fab/Google 同款）===
    // 方便用户直接按键覆盖新搜索，无需先手动删除；光标仍在输入框内不 blur。
    if (trimmed) {
      requestAnimationFrame(() => {
        inputRef.current?.select();
      });
    }
  }, [query, addSearchHistory]);

  // 过滤匹配的历史条目
  const filteredHistory = searchHistory.filter(item => {
    if (!query.trim()) return true;
    return item.label.toLowerCase().includes(query.trim().toLowerCase());
  });

  const handleKeyDown = useCallback((e) => {
    if (showHistory && filteredHistory.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHistoryIndex(prev => Math.min(prev + 1, filteredHistory.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHistoryIndex(prev => Math.max(prev - 1, -1));
        return;
      }
      if (e.key === 'Enter' && historyIndex >= 0) {
        e.preventDefault();
        const selected = filteredHistory[historyIndex];
        if (selected) {
          setQuery(selected.label);
          setShowHistory(false);
          setHistoryIndex(-1);
          window.dispatchEvent(new CustomEvent('top-search-query-changed', {
            detail: { query: selected.label }
          }));
          window.dispatchEvent(new Event('trigger-search'));
          addSearchHistory(selected.label, selected.value);
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowHistory(false);
        setHistoryIndex(-1);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch, showHistory, filteredHistory, historyIndex, addSearchHistory]);

  // 点击外部关闭历史下拉
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (barRef.current && !barRef.current.contains(e.target) &&
          historyRef.current && !historyRef.current.contains(e.target)) {
        setShowHistory(false);
        setHistoryIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 选择历史条目
  const handleSelectHistory = useCallback((item) => {
    setQuery(item.label);
    setShowHistory(false);
    setHistoryIndex(-1);
    addSearchHistory(item.label, item.value);
    window.dispatchEvent(new CustomEvent('top-search-query-changed', {
      detail: { query: item.label }
    }));
    window.dispatchEvent(new Event('trigger-search'));
  }, [addSearchHistory]);

  const handleClear = useCallback(() => {
    setQuery('');
    setShowHistory(false);
    setHistoryIndex(-1);
    window.dispatchEvent(new CustomEvent('top-search-query-changed', {
      detail: { query: '' }
    }));
    // 与"清除图片"对齐：清空后自动触发一次搜索回到浏览模式，
    // 让结果列表 / 标题 / URL ?q= 同步重置（修复"点击 × 后页面无反应"）
    setTimeout(() => window.dispatchEvent(new Event('trigger-search')), 0);
  }, []);

  const handleChange = useCallback((e) => {
    const val = e.target.value;
    setQuery(val);
    window.dispatchEvent(new CustomEvent('top-search-query-changed', {
      detail: { query: val }
    }));
  }, []);

  // === 图片上传相关 ===
  const dispatchImage = useCallback((base64, name = '', error = '') => {
    setImagePreview(base64 || null);
    window.dispatchEvent(new CustomEvent('top-image-uploaded', {
      detail: { imageBase64: base64, imageName: name, imageError: error }
    }));
    // 图片上传后自动触发搜索（无需用户再按 Enter）
    if (base64) {
      setTimeout(() => window.dispatchEvent(new Event('trigger-search')), 100);
    }
  }, []);

  const handleCameraClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      e.target.value = '';
      const name = file.name || 'image';
      if (file.size > 10 * 1024 * 1024) {
        dispatchImage('', name, '图片过大(>10MB)，请压缩后重试');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => dispatchImage(ev.target.result, name);
      reader.readAsDataURL(file);
    }
  }, [dispatchImage]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    barRef.current?.classList.add('top-search-bar--dragover');
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    barRef.current?.classList.remove('top-search-bar--dragover');
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    barRef.current?.classList.remove('top-search-bar--dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const name = file.name || 'image';
      if (file.size > 10 * 1024 * 1024) {
        dispatchImage('', name, '图片过大(>10MB)，请压缩后重试');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => dispatchImage(ev.target.result, name);
      reader.readAsDataURL(file);
    }
  }, [dispatchImage]);

  const handlePaste = useCallback(async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const name = 'clipboard_image.' + (imageType.split('/')[1] || 'png');
          if (blob.size > 10 * 1024 * 1024) {
            dispatchImage('', name, '图片过大(>10MB)，请压缩后重试');
            break;
          }
          const reader = new FileReader();
          reader.onload = (ev) => dispatchImage(ev.target.result, name);
          reader.readAsDataURL(blob);
          break;
        }
      }
    } catch {
      // clipboard API 不可用时静默失败
    }
  }, [dispatchImage]);

  const handleClearImage = useCallback(() => {
    setImagePreview(null);
    window.dispatchEvent(new CustomEvent('top-image-uploaded', {
      detail: { imageBase64: '', imageName: '', imageError: '' }
    }));
    // 清除图片后自动触发搜索回到浏览模式
    setTimeout(() => window.dispatchEvent(new Event('trigger-search')), 100);
  }, []);

  return (
    <div
      ref={barRef}
      className={`top-search-bar ${imagePreview ? 'top-search-bar--has-image' : ''}`}
      style={style}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(e) => { e.preventDefault(); handlePaste(); }}
    >
      {/* 已上传图片缩略图 */}
      {imagePreview && (
        <div className="top-search-thumb">
          <img src={imagePreview} alt="" className="top-search-thumb-img" />
          <span className="top-search-thumb-dot" />
          <button
            className="top-search-thumb-remove"
            onClick={handleClearImage}
            aria-label="Remove image"
          >
            ✕
          </button>
        </div>
      )}

      <svg className="top-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        className="top-search-input"
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (searchHistory.length > 0) setShowHistory(true); }}
        placeholder={isDragging ? (t('dropImageHere') || '松开释放图片...') : imagePreview ? (t('imageSearchActivePlaceholder') || 'Add text to refine image search...') : (t('searchPlaceholder') || 'Search assets...')}
        autoComplete="off"
        spellCheck="false"
      />
      {query && (
        <button className="top-search-clear" onClick={handleClear} aria-label="Clear search">
          ✕
        </button>
      )}

      {/* 相机图标（图片上传入口） */}
      <button
        className={`top-search-camera ${imagePreview ? 'top-search-camera--active' : ''}`}
        onClick={handleCameraClick}
        aria-label={t('dragImageOrClick') || 'Upload image'}
        title={t('rightClickToPaste') || 'Right-click to paste image'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </button>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <button className="top-search-btn" onClick={handleSearch} aria-label="Search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* 搜索历史下拉 */}
      {showHistory && filteredHistory.length > 0 && (
        <div className="top-search-history" ref={historyRef}>
          <div className="top-search-history-header">
            <span className="top-search-history-title">{t('searchHistoryTitle') || '搜索历史'}</span>
          </div>
          <div className="top-search-history-list">
            {filteredHistory.map((item, idx) => (
              <div
                key={item.timestamp || idx}
                className={`top-search-history-item ${idx === historyIndex ? 'top-search-history-item--active' : ''}`}
                onClick={() => handleSelectHistory(item)}
              >
                <svg className="top-search-history-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="top-search-history-text">{item.label}</span>
                <button
                  className="top-search-history-remove"
                  onClick={(e) => { e.stopPropagation(); removeSearchHistory(item.value); }}
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button className="top-search-history-clear" onClick={clearSearchHistory}>
            {t('searchHistoryClear') || '清除全部历史'}
          </button>
        </div>
      )}
    </div>
  );
}

export default TopSearchBar;
