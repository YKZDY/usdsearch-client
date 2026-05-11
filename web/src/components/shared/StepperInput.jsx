import React, { memo, useCallback } from 'react';
import {
  HStack,
  VStack,
  IconButton,
  Input,
  Text,
  Tooltip,
  Box,
} from '@chakra-ui/react';
import { ChevronUpIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { useLongPress } from './useLongPress';
import { useStepValue } from './useStepValue';

/**
 * StepperInput - 步进输入组件
 * 
 * 数值显示 + ▲▼◀▶ 箭头 + 长按加速 + 键盘支持 + tooltip
 * 
 * Props:
 * - value: 当前值
 * - onChange: 值变化回调（本地更新）
 * - onCommit: blur/Enter 时调用（提交到父级）
 * - min/max: 边界
 * - fineStep: ▲▼ 步进值
 * - coarseStep: ◀▶ 步进值
 * - precision: 小数位数
 * - unit: 单位标签
 * - tooltipFine: ▲▼ tooltip
 * - tooltipCoarse: ◀▶ tooltip
 * - label: 输入框标签
 * - size: 'sm' | 'md'
 */
const StepperInput = memo(function StepperInput({
  value,
  onChange,
  onCommit,
  min = -Infinity,
  max = Infinity,
  fineStep = 1,
  coarseStep = 10,
  precision = 2,
  unit = '',
  tooltipFine = '',
  tooltipCoarse = '',
  label = '',
  size = 'sm',
}) {
  const {
    value: stepValue,
    setValue,
    setValueSilent,
    stepUp,
    stepDown,
    stepLeft,
    stepRight,
    isAtMin,
    isAtMax,
    handleKeyDown,
  } = useStepValue({
    initialValue: Number(value) || 0,
    min,
    max,
    fineStep,
    coarseStep,
    precision,
    onChange,
  });

  // 同步外部 value 变化（静默同步，不触发 onChange 避免污染父级 state）
  React.useEffect(() => {
    const numVal = Number(value);
    if (!isNaN(numVal) && numVal !== stepValue) {
      setValueSilent(numVal);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // 长按 handlers
  const upPress = useLongPress(stepUp);
  const downPress = useLongPress(stepDown);
  const leftPress = useLongPress(stepLeft);
  const rightPress = useLongPress(stepRight);

  const handleInputChange = useCallback((e) => {
    const raw = e.target.value;
    // 只保留数字、小数点和负号
    const filtered = raw.replace(/[^0-9.\-]/g, ''); // eslint-disable-line no-useless-escape
    const num = Number(filtered);
    if (!isNaN(num)) {
      setValue(num);
    }
  }, [setValue]);

  const handleBlur = useCallback(() => {
    onCommit?.();
  }, [onCommit]);

  const handleKeyDownInput = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit?.();
    } else {
      handleKeyDown(e);
    }
  }, [onCommit, handleKeyDown]);

  const btnSize = size === 'sm' ? 'xs' : 'sm';
  const inputSize = size;

  return (
    <VStack spacing={1} align="stretch">
      {label && (
        <Text fontSize="xs" color="whiteAlpha.700" fontWeight="500">
          {label}
        </Text>
      )}
      <HStack spacing={1} align="center">
        {/* ◀ 粗步进减 */}
        <Tooltip label={tooltipCoarse || `−${coarseStep}`} placement="top" hasArrow>
          <IconButton
            icon={<ChevronLeftIcon boxSize={4} />}
            aria-label={`减 ${coarseStep}`}
            size={btnSize}
            variant="outline"
            color="whiteAlpha.800"
            borderColor="whiteAlpha.300"
            _hover={{ bg: 'whiteAlpha.200', borderColor: 'whiteAlpha.500' }}
            isDisabled={isAtMin}
            {...leftPress}
          />
        </Tooltip>

        {/* ▼ 精细步进减 */}
        <Tooltip label={tooltipFine || `−${fineStep}`} placement="top" hasArrow>
          <IconButton
            icon={<ChevronDownIcon boxSize={4} />}
            aria-label={`减 ${fineStep}`}
            size={btnSize}
            variant="outline"
            color="whiteAlpha.800"
            borderColor="whiteAlpha.300"
            _hover={{ bg: 'whiteAlpha.200', borderColor: 'whiteAlpha.500' }}
            isDisabled={isAtMin}
            {...downPress}
          />
        </Tooltip>

        {/* 数值输入框 */}
        <Box flex={1}>
          <Input
            value={stepValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDownInput}
            size={inputSize}
            textAlign="center"
            bg="whiteAlpha.100"
            border="1px solid"
            borderColor="whiteAlpha.200"
            borderRadius="8px"
            _hover={{ borderColor: 'whiteAlpha.400' }}
            _focus={{ borderColor: 'white', boxShadow: 'none' }}
            color="white"
            fontWeight="600"
            fontSize={size === 'sm' ? '13px' : '14px'}
            px={2}
          />
        </Box>

        {/* ▲ 精细步进加 */}
        <Tooltip label={tooltipFine || `+${fineStep}`} placement="top" hasArrow>
          <IconButton
            icon={<ChevronUpIcon boxSize={4} />}
            aria-label={`加 ${fineStep}`}
            size={btnSize}
            variant="outline"
            color="whiteAlpha.800"
            borderColor="whiteAlpha.300"
            _hover={{ bg: 'whiteAlpha.200', borderColor: 'whiteAlpha.500' }}
            isDisabled={isAtMax}
            {...upPress}
          />
        </Tooltip>

        {/* ▶ 粗步进加 */}
        <Tooltip label={tooltipCoarse || `+${coarseStep}`} placement="top" hasArrow>
          <IconButton
            icon={<ChevronRightIcon boxSize={4} />}
            aria-label={`加 ${coarseStep}`}
            size={btnSize}
            variant="outline"
            color="whiteAlpha.800"
            borderColor="whiteAlpha.300"
            _hover={{ bg: 'whiteAlpha.200', borderColor: 'whiteAlpha.500' }}
            isDisabled={isAtMax}
            {...rightPress}
          />
        </Tooltip>

        {/* 单位 */}
        {unit && (
          <Text fontSize="xs" color="whiteAlpha.600" minW="24px">
            {unit}
          </Text>
        )}
      </HStack>
    </VStack>
  );
});

export default StepperInput;
