/**
 * useFilterMemory - 统一筛选记忆 hook
 * 
 * 功能：
 * - 基于 localStorage 持久化用户的自定义筛选值
 * - LRU 淘汰策略（超出上限删除最早使用的）
 * - 去重（相同值不重复存储，但会提升到最前面）
 * - 每个筛选维度独立存储
 * 
 * 存储格式：
 *   localStorage key: `usdsearch_memory_{dimension}`
 *   value: JSON Array<{ label: string, value: any, timestamp: number }>
 * 
 * 各维度上限：
 *   size: 5, date: 4, dimension: 4, user: 6, format: 3, search: 10
 */

import { useState, useCallback, useMemo } from 'react';

const STORAGE_PREFIX = 'usdsearch_memory_';

// 各维度的记忆上限
const MEMORY_LIMITS = {
  size: 5,
  date: 4,
  dimension: 4,
  user: 6,
  format: 3,
  search: 10,
  // 第 5 阶段新增
  path: 4,
  tags: 5,
  precision: 3,
};

/**
 * 从 localStorage 读取记忆列表
 */
function readMemory(dimension) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + dimension);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 写入 localStorage
 */
function writeMemory(dimension, items) {
  try {
    localStorage.setItem(STORAGE_PREFIX + dimension, JSON.stringify(items));
  } catch {
    // localStorage 满时静默失败
  }
}

/**
 * 比较两个 value 是否相同（支持对象深比较）
 */
function isSameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object' && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/**
 * useFilterMemory hook
 * 
 * @param {string} dimension - 筛选维度 key (size|date|dimension|user|format|search)
 * @returns {{ memories, addMemory, removeMemory, clearAll }}
 */
export function useFilterMemory(dimension) {
  const limit = MEMORY_LIMITS[dimension] || 5;
  
  // 初始化从 localStorage 读取
  const [memories, setMemories] = useState(() => readMemory(dimension));

  /**
   * 添加一条记忆
   * - 如果已存在相同值，提升到最前面（更新 timestamp）
   * - 超出上限则删除最末尾的（最早的）
   * 
   * @param {string} label - 显示文本
   * @param {any} value - 存储的值
   */
  const addMemory = useCallback((label, value) => {
    setMemories(prev => {
      // 去重：移除已有的相同值
      const filtered = prev.filter(item => !isSameValue(item.value, value));
      // 新记录放最前面
      const next = [{ label, value, timestamp: Date.now() }, ...filtered];
      // LRU 淘汰
      const trimmed = next.slice(0, limit);
      // 持久化
      writeMemory(dimension, trimmed);
      return trimmed;
    });
  }, [dimension, limit]);

  /**
   * 删除一条记忆
   */
  const removeMemory = useCallback((value) => {
    setMemories(prev => {
      const next = prev.filter(item => !isSameValue(item.value, value));
      writeMemory(dimension, next);
      return next;
    });
  }, [dimension]);

  /**
   * 清除全部记忆
   */
  const clearAll = useCallback(() => {
    writeMemory(dimension, []);
    setMemories([]);
  }, [dimension]);

  return { memories, addMemory, removeMemory, clearAll };
}

/**
 * 便捷函数：不通过 hook 直接读取记忆（用于组件初始化等场景）
 */
export function getFilterMemory(dimension) {
  return readMemory(dimension);
}

/**
 * 便捷函数：不通过 hook 直接添加记忆
 */
export function addFilterMemoryDirect(dimension, label, value) {
  const limit = MEMORY_LIMITS[dimension] || 5;
  const prev = readMemory(dimension);
  const filtered = prev.filter(item => !isSameValue(item.value, value));
  const next = [{ label, value, timestamp: Date.now() }, ...filtered].slice(0, limit);
  writeMemory(dimension, next);
  return next;
}

export default useFilterMemory;
