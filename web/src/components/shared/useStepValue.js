import { useState, useCallback, useRef } from 'react';

/**
 * useStepValue - 步进值管理 hook
 * 
 * 管理一个数值的步进逻辑，包含：
 * - 边界保护（min/max）
 * - 精细步进（fineStep）和粗步进（coarseStep）
 * - 动效触发信号
 * - 键盘 ↑↓ 支持
 * 
 * @param {Object} options
 * @param {number} options.initialValue - 初始值
 * @param {number} options.min - 最小值
 * @param {number} options.max - 最大值
 * @param {number} options.fineStep - 精细步进值（▲▼）
 * @param {number} options.coarseStep - 粗步进值（◀▶）
 * @param {number} options.precision - 小数精度位数
 * @param {Function} options.onChange - 值变化时回调
 * @returns {{ value, setValue, stepUp, stepDown, stepLeft, stepRight, isAtMin, isAtMax, animTrigger, handleKeyDown }}
 */
export function useStepValue({
  initialValue = 0,
  min = -Infinity,
  max = Infinity,
  fineStep = 1,
  coarseStep = 10,
  precision = 2,
  onChange,
} = {}) {
  const [value, setValueState] = useState(initialValue);
  const [animTrigger, setAnimTrigger] = useState(0); // 递增触发动效
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const clamp = useCallback((val) => {
    const num = Number(val);
    if (isNaN(num)) return value;
    return Math.min(max, Math.max(min, Number(num.toFixed(precision))));
  }, [min, max, precision, value]);

  const setValue = useCallback((newVal) => {
    const clamped = clamp(newVal);
    setValueState(clamped);
    onChangeRef.current?.(clamped);
    return clamped;
  }, [clamp]);

  // 静默 setValue：仅更新内部 state，不触发 onChange（用于外部 prop 同步）
  const setValueSilent = useCallback((newVal) => {
    const clamped = clamp(newVal);
    setValueState(clamped);
    return clamped;
  }, [clamp]);

  const triggerAnim = useCallback(() => {
    setAnimTrigger(prev => prev + 1);
  }, []);

  const stepUp = useCallback(() => {
    setValueState(prev => {
      const next = clamp(Number(prev) + fineStep);
      onChangeRef.current?.(next);
      triggerAnim();
      return next;
    });
  }, [fineStep, clamp, triggerAnim]);

  const stepDown = useCallback(() => {
    setValueState(prev => {
      const next = clamp(Number(prev) - fineStep);
      onChangeRef.current?.(next);
      triggerAnim();
      return next;
    });
  }, [fineStep, clamp, triggerAnim]);

  const stepRight = useCallback(() => {
    setValueState(prev => {
      const next = clamp(Number(prev) + coarseStep);
      onChangeRef.current?.(next);
      triggerAnim();
      return next;
    });
  }, [coarseStep, clamp, triggerAnim]);

  const stepLeft = useCallback(() => {
    setValueState(prev => {
      const next = clamp(Number(prev) - coarseStep);
      onChangeRef.current?.(next);
      triggerAnim();
      return next;
    });
  }, [coarseStep, clamp, triggerAnim]);

  // 键盘支持：↑↓ 映射到 fineStep，←→ 映射到 coarseStep，Shift 加速
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (e.shiftKey) stepRight(); else stepUp();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (e.shiftKey) stepLeft(); else stepDown();
    } else if (e.key === 'ArrowLeft') {
      // 光标在最前端 or 全选状态时触发 coarseStep 减
      const input = e.target;
      if (input.selectionStart === 0 && input.selectionEnd === 0) {
        e.preventDefault();
        stepLeft();
      }
    } else if (e.key === 'ArrowRight') {
      // 光标在最末尾时触发 coarseStep 加
      const input = e.target;
      const len = String(input.value).length;
      if (input.selectionStart === len && input.selectionEnd === len) {
        e.preventDefault();
        stepRight();
      }
    }
  }, [stepUp, stepDown, stepLeft, stepRight]);

  const isAtMin = Number(value) <= min;
  const isAtMax = Number(value) >= max;

  return {
    value,
    setValue,
    setValueSilent,
    stepUp,
    stepDown,
    stepLeft,
    stepRight,
    isAtMin,
    isAtMax,
    animTrigger,
    handleKeyDown,
  };
}

export default useStepValue;
