import React, { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { VStack, Text, Divider, Box, Wrap, WrapItem } from '@chakra-ui/react';
import FilterPopoverButton from './FilterPopoverButton';
import StepperInput from '../shared/StepperInput';
import QuickTags from '../shared/QuickTags';
import MemoryChip from './MemoryChip';
import { useLocalFilterState } from '../shared/useLocalFilterState';
import { useFilterMemory } from '../../hooks/useFilterMemory';

/** 相似度图标（瞄准镜） */
const TargetIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="8" cy="8" r="6" />
    <circle cx="8" cy="8" r="2.5" fill="currentColor" />
  </svg>
);

/** 截断图标（剪刀/分隔线） */
const CutIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <line x1="2.5" y1="8" x2="13.5" y2="8" />
    <circle cx="5" cy="4" r="2" />
    <circle cx="5" cy="12" r="2" />
  </svg>
);

const PRECISION_KEYS = ['similarity_threshold', 'cutoff_threshold'];

// 预设默认值（仅用于 StepperInput 显示层；不写入 searchParams 避免 ghost dirty）
const DEFAULTS = {
  similarity_threshold: 0.75,
  cutoff_threshold: 0.50,
};

// 相似度快捷值（5档占满一行；越高越严格）
const SIMILARITY_TAGS = [
  { label: '0.6', value: 0.6 },
  { label: '0.7', value: 0.7 },
  { label: '0.8', value: 0.8 },
  { label: '0.9', value: 0.9 },
  { label: '0.95', value: 0.95 },
];

// 截断快捷值（5档占满一行；越低越宽松）
const CUTOFF_TAGS = [
  { label: '0.2', value: 0.2 },
  { label: '0.4', value: 0.4 },
  { label: '0.5', value: 0.5 },
  { label: '0.7', value: 0.7 },
  { label: '0.9', value: 0.9 },
];

// 判断某值是否命中某个快捷 tag
function isInQuickTags(val, tags) {
  if (val === '' || val === null || val === undefined) return false;
  const num = Number(val);
  return tags.some(t => Math.abs(t.value - num) < 1e-6);
}

/**
 * PrecisionFilter - 精度筛选面板
 * 
 * 功能：
 * - 默认值（相似度 0.75，截断 0.50）仅在显示层填充，不污染 searchParams
 * - ▲▼ 步进 ±0.01（精细），◀▶ 步进 ±0.1（快速）
 * - 快捷 tag 一键跳值（即时生效）
 * - 记忆 3 条最近自定义组合（非快捷值）
 */
const PrecisionFilter = memo(function PrecisionFilter({
  searchParams,
  handleChange,
  onTriggerSearch,
  t,
}) {
  // 记忆功能
  const {
    memories: precMemories,
    addMemory: addPrecMemory,
    removeMemory: removePrecMemory,
  } = useFilterMemory('precision');

  // 用 ref 保证即时存记忆时能拿到最新 searchParams（避免 stale closure）
  const searchParamsRef = useRef(searchParams);
  useEffect(() => { searchParamsRef.current = searchParams; }, [searchParams]);

  /**
   * 保存精度记忆（core = {similarity_threshold, cutoff_threshold}）
   * - 先按 core 去重（剥离 fromPreset 差异），再 addMemory(withFromPreset)
   * - 至少有一项非空才存；全空直接跳过
   */
  const savePrecMemory = useCallback((sim, cut, fromPreset) => {
    const simVal = sim === '' || sim === null || sim === undefined ? '' : sim;
    const cutVal = cut === '' || cut === null || cut === undefined ? '' : cut;
    if (simVal === '' && cutVal === '') return;
    const core = { similarity_threshold: simVal, cutoff_threshold: cutVal };
    // 去重：剥离 fromPreset 后比较
    removePrecMemory({ ...core, fromPreset: true });
    removePrecMemory({ ...core, fromPreset: false });
    removePrecMemory(core); // 兼容老数据（无 fromPreset 字段）
    const simStr = simVal !== '' ? Number(simVal).toFixed(2) : '默认';
    const cutStr = cutVal !== '' ? Number(cutVal).toFixed(2) : '默认';
    const label = `相似 ${simStr} / 截断 ${cutStr}`;
    addPrecMemory(label, { ...core, fromPreset: !!fromPreset });
  }, [addPrecMemory, removePrecMemory]);

  const onCommit = useCallback((changed) => {
    Object.entries(changed).forEach(([key, val]) => {
      handleChange(key, val);
    });
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch]);

  // 重要：useLocalFilterState 用「未填充默认值的 searchParams」做基准，
  // 避免「searchParams.similarity_threshold='' vs localValues=0.75」造成的假 dirty。
  const { localValues, setLocalValue, commit, commitIfDirty, reset } = useLocalFilterState(
    searchParams,
    PRECISION_KEYS,
    onCommit
  );

  // StepperInput 的显示值：localValues 为空 → 显示默认值（仅展示，不写入）
  const displayValues = useMemo(() => ({
    similarity_threshold: localValues.similarity_threshold !== '' && localValues.similarity_threshold !== null && localValues.similarity_threshold !== undefined
      ? localValues.similarity_threshold
      : DEFAULTS.similarity_threshold,
    cutoff_threshold: localValues.cutoff_threshold !== '' && localValues.cutoff_threshold !== null && localValues.cutoff_threshold !== undefined
      ? localValues.cutoff_threshold
      : DEFAULTS.cutoff_threshold,
  }), [localValues]);

  // 快捷 tag 即时生效（再点同一个值 = 恢复默认值=清空 searchParams）
  const handleSimilarityTag = useCallback((val) => {
    const current = Number(searchParams.similarity_threshold);
    const isToggleOff = current === val;
    if (isToggleOff) {
      // 再次点击 → 清空（恢复"使用默认值"语义）
      setLocalValue('similarity_threshold', '');
      handleChange('similarity_threshold', '');
    } else {
      setLocalValue('similarity_threshold', val);
      handleChange('similarity_threshold', val);
    }
    onTriggerSearch?.();
    // 即时存记忆（除非是"取消选择"）
    if (!isToggleOff) {
      const latestCut = searchParamsRef.current.cutoff_threshold;
      savePrecMemory(val, latestCut, true);
    }
  }, [handleChange, onTriggerSearch, setLocalValue, searchParams.similarity_threshold, savePrecMemory]);

  const handleCutoffTag = useCallback((val) => {
    const current = Number(searchParams.cutoff_threshold);
    const isToggleOff = current === val;
    if (isToggleOff) {
      setLocalValue('cutoff_threshold', '');
      handleChange('cutoff_threshold', '');
    } else {
      setLocalValue('cutoff_threshold', val);
      handleChange('cutoff_threshold', val);
    }
    onTriggerSearch?.();
    if (!isToggleOff) {
      const latestSim = searchParamsRef.current.similarity_threshold;
      savePrecMemory(latestSim, val, true);
    }
  }, [handleChange, onTriggerSearch, setLocalValue, searchParams.cutoff_threshold, savePrecMemory]);

  const handleReset = useCallback(() => {
    handleChange('similarity_threshold', '');
    handleChange('cutoff_threshold', '');
    reset();
    onTriggerSearch?.();
  }, [handleChange, reset, onTriggerSearch]);

  // 应用记忆（写入 searchParams + localValues）
  const handleMemoryTag = useCallback((memValue) => {
    const sim = memValue?.similarity_threshold ?? '';
    const cut = memValue?.cutoff_threshold ?? '';
    handleChange('similarity_threshold', sim ?? '');
    handleChange('cutoff_threshold', cut ?? '');
    setLocalValue('similarity_threshold', sim ?? '');
    setLocalValue('cutoff_threshold', cut ?? '');
    onTriggerSearch?.();
  }, [handleChange, setLocalValue, onTriggerSearch]);

  // onClose：commitIfDirty 提交任何未保存的步进编辑；只要有任何值就兜底存一次自定义记忆
  // （即时存储已覆盖"点击快捷 tag"场景；本兜底主要覆盖"在 StepperInput 中手动输入后关闭"）
  const handleClose = useCallback(() => {
    commitIfDirty();
    const sim = searchParamsRef.current.similarity_threshold;
    const cut = searchParamsRef.current.cutoff_threshold;
    const simIsCustom = sim !== '' && sim !== null && sim !== undefined && !isInQuickTags(sim, SIMILARITY_TAGS);
    const cutIsCustom = cut !== '' && cut !== null && cut !== undefined && !isInQuickTags(cut, CUTOFF_TAGS);
    if (simIsCustom || cutIsCustom) {
      // 仅当含自定义值时兜底存（全预设已在点击时存过）
      savePrecMemory(sim, cut, false);
    }
  }, [commitIfDirty, savePrecMemory]);

  // 判断是否有激活的筛选
  const isActive = !!(searchParams.similarity_threshold || searchParams.cutoff_threshold);

  return (
    <FilterPopoverButton
      label={t?.('fabFilterPrecision') || '精度'}
      isActive={isActive}
      onClose={handleClose}
      onReset={handleReset}
      minW="320px"
      maxW="400px"
    >
      <VStack spacing={3} align="stretch">
        {/* 相似度阈值 */}
        <Text fontSize="xs" color="whiteAlpha.700" fontWeight="600">
          {t?.('precisionSimilarity') || '相似度阈值'}
        </Text>
        <StepperInput
          value={displayValues.similarity_threshold}
          onChange={(val) => setLocalValue('similarity_threshold', val)}
          onCommit={commit}
          min={0}
          max={1}
          fineStep={0.01}
          coarseStep={0.1}
          precision={2}
          tooltipFine={t?.('stepFine001') || '步进 ±0.01'}
          tooltipCoarse={t?.('stepCoarse01') || '步进 ±0.1'}
        />
        <QuickTags
          tags={SIMILARITY_TAGS}
          selectedValue={Number(searchParams.similarity_threshold) || null}
          onSelect={handleSimilarityTag}
        />

        <Divider borderColor="whiteAlpha.200" my={1} />

        {/* 截断阈值 */}
        <Text fontSize="xs" color="whiteAlpha.700" fontWeight="600">
          {t?.('precisionCutoff') || '截断阈值'}
        </Text>
        <StepperInput
          value={displayValues.cutoff_threshold}
          onChange={(val) => setLocalValue('cutoff_threshold', val)}
          onCommit={commit}
          min={0}
          max={1}
          fineStep={0.05}
          coarseStep={0.1}
          precision={2}
          tooltipFine={t?.('stepFine005') || '步进 ±0.05'}
          tooltipCoarse={t?.('stepCoarse01') || '步进 ±0.1'}
        />
        <QuickTags
          tags={CUTOFF_TAGS}
          selectedValue={Number(searchParams.cutoff_threshold) || null}
          onSelect={handleCutoffTag}
        />

        {/* 记忆的精度组合 */}
        {precMemories.length > 0 && (
          <Box>
            <Divider borderColor="whiteAlpha.200" my={1} />
            <Text fontSize="12px" color="whiteAlpha.600" fontWeight="500" letterSpacing="0.02em" mb={2.5}>
              {t?.('precisionRecentMemory') || t?.('recentCustom') || '最近精度组合'}
            </Text>
            <Wrap spacing={2}>
              {precMemories.map((mem, idx) => {
                const sim = mem.value?.similarity_threshold;
                const cut = mem.value?.cutoff_threshold;
                const isPreset = !!(mem.value && typeof mem.value === 'object' && mem.value.fromPreset);
                const segs = [];
                if (sim !== '' && sim !== null && sim !== undefined) {
                  segs.push({
                    icon: <TargetIcon />,
                    label: `${t?.('precisionSimShort') || '相似'} ${Number(sim).toFixed(2)}`,
                    tone: 'gold',
                    isPreset,
                  });
                }
                if (cut !== '' && cut !== null && cut !== undefined) {
                  segs.push({
                    icon: <CutIcon />,
                    label: `${t?.('precisionCutShort') || '截断'} ${Number(cut).toFixed(2)}`,
                    tone: 'neutral',
                  });
                }
                if (segs.length === 0) return null;
                return (
                  <WrapItem key={idx}>
                    <MemoryChip
                      segments={segs}
                      tooltip={mem.label}
                      presetTooltip={t?.('memoryFromPreset') || '来自快捷预设'}
                      onClick={() => handleMemoryTag(mem.value)}
                      onRemove={() => removePrecMemory(mem.value)}
                    />
                  </WrapItem>
                );
              })}
            </Wrap>
          </Box>
        )}
      </VStack>
    </FilterPopoverButton>
  );
});

export default PrecisionFilter;
