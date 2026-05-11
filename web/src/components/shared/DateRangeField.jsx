import React, { memo, useCallback, useRef } from 'react';
import { Box, HStack, Text, Tooltip } from '@chakra-ui/react';
import { CalendarIcon, CloseIcon } from '@chakra-ui/icons';
import { calcDays } from '../../utils/dateFormat';

/**
 * DateRangeField - 起止日期范围（胶囊容器 + 两段等宽 + 中间分隔线）
 *
 * 设计要点：
 * - 整体一个胶囊（圆角 8px、统一边框、统一高度 32px）
 * - 起/止两段 flex=1 等宽，绝不会被挤换行
 * - 每段是「按钮形态」：日历图标 + 文本（已设值显示日期、未设值显示「选择」/「至今」）
 *   点击整段 → 调用 hidden native date input 的 showPicker() 弹出选择器
 * - 已设值时段尾出现 ✕ 清空按钮（hover 才显，避免误点）
 * - 整体 hover 提亮边框；某段聚焦时该段单独高亮
 * - 右侧浮出 "共 N 天" 辅助信息（仅在 startValue 有值时）
 *
 * 完全替代旧的 EndDateField 双态切换交互。
 *
 * Props:
 * - startValue / endValue: string YYYY-MM-DD（'' 表示未设）
 * - onChange: (key, val) => void  key in 'start' | 'end'
 * - onCommit: () => void
 * - t?: i18n
 * - emptyEndLabel?: string  endValue 为空时显示的文本（默认「至今」）
 */
const DateRangeField = memo(function DateRangeField({
  startValue,
  endValue,
  onChange,
  onCommit,
  t,
  emptyEndLabel,
}) {
  const startRef = useRef(null);
  const endRef = useRef(null);

  const labels = {
    pickStart: t?.('dateClickToSetStart') || t?.('dateClickToEdit') || '点击设置开始日期',
    pickEnd: t?.('dateClickToEdit') || '点击设置结束日期',
    toNow: emptyEndLabel || t?.('dateToNow') || '至今',
    clear: t?.('dateClickToReset') || '点击清空',
    daysSuffix: t?.('dateDays') || '共 {n} 天',
  };

  const openPicker = useCallback((ref) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    try { el.showPicker?.(); } catch { /* noop on browsers without showPicker */ }
  }, []);

  const days = calcDays(startValue, endValue);
  const showDays = !!startValue && days > 0;

  // 单段渲染
  const renderSegment = ({ value, refObj, onSet, ariaLabel, placeholder, hoverLabel }) => {
    const hasValue = !!value;
    return (
      <Tooltip
        label={hoverLabel}
        placement="top"
        hasArrow
        openDelay={400}
        fontSize="11px"
        bg="gray.800"
      >
        <HStack
          as="button"
          type="button"
          aria-label={ariaLabel}
          spacing={2}
          flex={1}
          minW={0}
          h="full"
          px={3}
          cursor="pointer"
          color={hasValue ? 'whiteAlpha.900' : 'whiteAlpha.500'}
          bg="transparent"
          _hover={{
            bg: 'rgba(123,200,255,0.06)',
            '& .pt-cal': { color: '#7BC8FF' },
            '& .pt-clear': { opacity: 1 },
          }}
          _focusVisible={{
            outline: 'none',
            bg: 'rgba(123,200,255,0.10)',
          }}
          transition="background 0.12s ease"
          onClick={() => openPicker(refObj)}
          position="relative"
          role="group"
        >
          <CalendarIcon
            className="pt-cal"
            boxSize={3}
            color={hasValue ? '#7BC8FF' : 'whiteAlpha.500'}
            transition="color 0.12s"
            flexShrink={0}
          />
          <Box
            flex={1}
            minW={0}
            fontSize="12px"
            fontWeight={hasValue ? 600 : 400}
            textAlign="left"
            letterSpacing={hasValue ? '0.01em' : '0.02em'}
            isTruncated
            fontFamily={hasValue ? '"SF Mono", ui-monospace, monospace' : 'inherit'}
          >
            {hasValue ? value.replaceAll('-', '/') : placeholder}
          </Box>
          {hasValue && (
            <Box
              className="pt-clear"
              as="span"
              role="button"
              aria-label={labels.clear}
              opacity={0}
              transition="opacity 0.15s"
              w="16px"
              h="16px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              borderRadius="full"
              bg="whiteAlpha.200"
              color="whiteAlpha.700"
              _hover={{ bg: 'rgba(255,139,139,0.3)', color: '#FF8B8B' }}
              onClick={(e) => {
                e.stopPropagation();
                onSet('');
                onCommit?.();
              }}
              flexShrink={0}
            >
              <CloseIcon boxSize={1.5} />
            </Box>
          )}

          {/* hidden native date input 仅作为 showPicker 触发器 */}
          <Box
            as="input"
            ref={refObj}
            type="date"
            value={value || ''}
            onChange={(e) => onSet(e.target.value)}
            onBlur={() => onCommit?.()}
            position="absolute"
            inset={0}
            opacity={0}
            pointerEvents="none"
            tabIndex={-1}
            aria-hidden="true"
          />
        </HStack>
      </Tooltip>
    );
  };

  return (
    <Box position="relative" flex={1} minW={0}>
      <HStack
        spacing={0}
        h="36px"
        borderRadius="10px"
        bg="rgba(255,255,255,0.04)"
        border="1px solid rgba(255,255,255,0.12)"
        overflow="hidden"
        transition="all 0.15s ease"
        _hover={{
          borderColor: 'rgba(123,200,255,0.35)',
          bg: 'rgba(255,255,255,0.06)',
        }}
        _focusWithin={{
          borderColor: 'rgba(123,200,255,0.6)',
          boxShadow: '0 0 0 3px rgba(123,200,255,0.12)',
          bg: 'rgba(255,255,255,0.06)',
        }}
      >
        {renderSegment({
          value: startValue,
          refObj: startRef,
          onSet: (v) => onChange('start', v),
          ariaLabel: labels.pickStart,
          placeholder: t?.('dateStartPlaceholder') || '开始日期',
          hoverLabel: labels.pickStart,
        })}

        {/* 中间分隔线 */}
        <Box w="1px" h="60%" bg="whiteAlpha.200" flexShrink={0} />

        {renderSegment({
          value: endValue,
          refObj: endRef,
          onSet: (v) => onChange('end', v),
          ariaLabel: labels.pickEnd,
          placeholder: labels.toNow,
          hoverLabel: labels.pickEnd,
        })}
      </HStack>

      {/* 右上角天数辅助 */}
      {showDays && (
        <Text
          position="absolute"
          right="2px"
          top="-16px"
          fontSize="10px"
          color="whiteAlpha.500"
          letterSpacing="0.02em"
          fontFamily='"SF Mono", ui-monospace, monospace'
          pointerEvents="none"
        >
          {labels.daysSuffix.replace('{n}', String(days))}
        </Text>
      )}
    </Box>
  );
});

export default DateRangeField;
