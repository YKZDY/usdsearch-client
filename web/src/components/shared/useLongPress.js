import { useRef, useCallback, useEffect } from 'react';

/**
 * useLongPress - 长按加速 hook
 * 
 * 单击执行一次 callback；按住超过 delay 后以 interval 间隔连续执行。
 * 
 * @param {Function} callback - 步进回调
 * @param {Object} options
 * @param {number} options.delay - 长按触发延迟（ms），默认 500
 * @param {number} options.interval - 连续执行间隔（ms），默认 100
 * @returns {{ onMouseDown, onMouseUp, onMouseLeave, onTouchStart, onTouchEnd }}
 */
export function useLongPress(callback, { delay = 500, interval = 100 } = {}) {
  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);
  const callbackRef = useRef(callback);

  // 始终引用最新的 callback
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const start = useCallback(() => {
    // 立即执行一次
    callbackRef.current?.();
    
    // delay 后开始连续执行
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        callbackRef.current?.();
      }, interval);
    }, delay);
  }, [delay, interval]);

  const stop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: start,
    onTouchEnd: stop,
  };
}

export default useLongPress;
