import React, { useEffect, useRef, useState } from 'react';

/**
 * AnimatedCount — 数字在变化时做一次短暂 count-up 过渡
 *
 * 背景：搜索/标签解耦后，搜索框不再自动填字，用户需要更明确的"条件生效、结果变了"反馈。
 * 本组件在 value 变化时，用 requestAnimationFrame 在 duration 内从旧值过渡到新值。
 *
 * @param {number} value     目标数字
 * @param {number} [duration=300] 过渡时长（ms）
 * @param {(n:number)=>string} [format] 自定义格式化（默认四舍五入）
 */
function AnimatedCount({ value = 0, duration = 300, format }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    // 首帧或值未变 → 直接同步
    if (fromRef.current === value) {
      setDisplay(value);
      return undefined;
    }
    const from = fromRef.current;
    const to = value;
    const delta = to - from;
    startRef.current = performance.now();

    const tick = (now) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + delta * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, duration]);

  const n = Math.round(display);
  return <>{format ? format(n) : n}</>;
}

export default React.memo(AnimatedCount);
