import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * 规范化值：null/undefined/'' 视为相同；其他用 String 比较
 */
function normalizeValue(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(v);
}

/**
 * useLocalFilterState - 管理筛选面板的本地状态与延迟提交
 * 
 * 输入过程中仅更新本地 state，触发时机：
 * - onBlur 事件
 * - Enter 键
 * - Popover onClose 事件
 * 
 * 内置「上次实际提交快照」(lastCommittedRef) —— 防止「面板打开后未编辑就关闭」误触发 onCommit。
 * 
 * @param {Object} searchParams - 父级搜索参数（committed state）
 * @param {string[]} keys - 需要管理的参数 key 列表
 * @param {Function} onCommit - 提交时调用（传入变化的参数对象）
 * @returns {{ localValues, setLocalValue, commit, commitIfDirty, reset, revert, isDirty }}
 */
export function useLocalFilterState(searchParams, keys, onCommit) {
  // 从 searchParams 中提取需要管理的字段作为初始值
  const getInitialValues = useCallback(() => {
    const values = {};
    keys.forEach(key => {
      values[key] = searchParams[key] ?? '';
    });
    return values;
  }, [searchParams, keys]);

  const [localValues, setLocalValues] = useState(getInitialValues);
  const prevSearchParamsRef = useRef(searchParams);
  // 「上次实际提交」快照：用于 commitIfDirty 严格守卫，杜绝幽灵提交
  const lastCommittedRef = useRef(getInitialValues());

  // 当外部 searchParams 变化时（如全局重置），同步到本地
  useEffect(() => {
    const prev = prevSearchParamsRef.current;
    let hasExternalChange = false;
    
    for (const key of keys) {
      if (searchParams[key] !== prev[key]) {
        hasExternalChange = true;
        break;
      }
    }
    
    if (hasExternalChange) {
      const next = getInitialValues();
      setLocalValues(next);
      // 外部变化是「真已提交」状态，同步快照
      lastCommittedRef.current = next;
    }
    prevSearchParamsRef.current = searchParams;
  }, [searchParams, keys, getInitialValues]);

  const setLocalValue = useCallback((key, value) => {
    setLocalValues(prev => ({ ...prev, [key]: value }));
  }, []);

  // 计算是否有未提交的变更（基于 searchParams，向后兼容旧 API）
  const isDirty = keys.some(key => {
    const local = normalizeValue(localValues[key]);
    const committed = normalizeValue(searchParams[key]);
    return local !== committed;
  });

  // 提交：对比 searchParams，仅变化的字段触发 onCommit（向后兼容旧调用）
  const commit = useCallback(() => {
    const changed = {};
    let hasChange = false;
    
    for (const key of keys) {
      const local = normalizeValue(localValues[key]);
      const committed = normalizeValue(searchParams[key]);
      if (local !== committed) {
        changed[key] = localValues[key];
        hasChange = true;
      }
    }
    
    if (hasChange && onCommit) {
      onCommit(changed);
      lastCommittedRef.current = { ...localValues };
    }
  }, [localValues, searchParams, keys, onCommit]);

  /**
   * commitIfDirty - 严格 dirty 守卫
   * 
   * 与 commit 的区别：使用 lastCommittedRef（上次实际提交快照）做对比，
   * 而非 searchParams。这样可避免「searchParams 已是 committed 状态、
   * localValues 也是同样的值，但被外部 effect 触发再次提交」的幽灵流。
   * 
   * @returns {boolean} 是否真的有提交（true=有，false=无变化）
   */
  const commitIfDirty = useCallback(() => {
    const changed = {};
    let hasChange = false;

    for (const key of keys) {
      const local = normalizeValue(localValues[key]);
      const last = normalizeValue(lastCommittedRef.current?.[key]);
      if (local !== last) {
        changed[key] = localValues[key];
        hasChange = true;
      }
    }

    if (hasChange && onCommit) {
      onCommit(changed);
      lastCommittedRef.current = { ...localValues };
      return true;
    }
    return false;
  }, [localValues, keys, onCommit]);

  // 重置为默认值（清空所有字段）
  const reset = useCallback(() => {
    const empty = {};
    keys.forEach(key => { empty[key] = ''; });
    setLocalValues(empty);
  }, [keys]);

  // 重置为当前 committed 值（撤销本地修改）
  const revert = useCallback(() => {
    setLocalValues(getInitialValues());
  }, [getInitialValues]);

  return {
    localValues,
    setLocalValue,
    setLocalValues,
    commit,
    commitIfDirty,
    reset,
    revert,
    isDirty,
  };
}

export default useLocalFilterState;
