// === LM CUSTOMIZATION: TagWeightSlider START ===
// 原因：C 组任务 3 — 把已隐藏在 HybridSearchConfig 字段编辑里的 tag/value 权重 + fuzzy_max_expansions
//       三个参数收敛成一个 0..100 的 Slider，左端"完全关闭 tag 匹配"、右端"严格 tag 匹配"。
//       本组件是新增文件，与英伟达原版无冲突；未来合入英伟达新版时整文件保留即可。
// 合入英伟达新版时：本文件可整体保留，无需特殊处理。
import React from 'react';
import {
  Box,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  SliderMark,
  HStack,
  VStack,
  Text,
  Badge,
  IconButton,
  Tooltip,
  FormControl,
  FormLabel,
} from '@chakra-ui/react';
import { RepeatIcon } from '@chakra-ui/icons';
import { useTranslation } from '../i18n/LanguageContext';
import {
  TAG_SLIDER_ANCHORS,
  inferSliderFromConfig,
  isTagConfigCustom,
} from '../utils/searchWeightMap';

/**
 * TagWeightSlider — Tag 匹配权重控制 Slider（5 档锚点 + Custom 提示 + 重置按钮）
 *
 * Props
 * @param {object}   hybridConfig          当前 hybridConfig（用于反推 Slider 位置 + 判断 Custom）
 * @param {(slider:number)=>void} onCommit 用户释放/键盘按下后的最终值（由父组件触发搜索/写回 hybridConfig）
 * @param {boolean}  [isDisabled]          外部禁用（如混合搜索关闭时）
 *
 * 实现要点：
 *   - 拖动期间仅更新本地状态 localSlider，不调 onCommit（避免每次像素移动都触发搜索请求）
 *   - 释放（onChangeEnd）或键盘（onChange + 防抖判定）才调 onCommit
 *   - 反向同步：父组件传入新的 hybridConfig 时，通过 useEffect 同步 localSlider，保持 UI 与状态一致
 *   - Slider 正常允许 0..100 任意值；非锚点状态显示 "Custom" Badge
 */
export default function TagWeightSlider({ hybridConfig, onCommit, isDisabled = false }) {
  const { t } = useTranslation();

  // i18n fallback：t() 内部已 `|| key` 兜底，外层 `t(k) || fallback` 永远不生效。
  // 用 tt() 检测"返回值===key"的情况再回退到英文兜底。
  // Step 4.7 会把所有 key 写入 en.js/zh.js 后此函数不再触发 fallback 分支。
  const tt = React.useCallback(
    (key, fallback) => {
      const v = t(key);
      return v === key ? fallback : v;
    },
    [t],
  );

  // 反推：根据当前 config 算出 Slider 应处的位置（由父组件维护"权威状态"，本组件仅做镜像）
  const inferredSlider = React.useMemo(() => inferSliderFromConfig(hybridConfig), [hybridConfig]);
  const isCustom = React.useMemo(() => isTagConfigCustom(hybridConfig), [hybridConfig]);

  const [localSlider, setLocalSlider] = React.useState(inferredSlider);

  // 当外部 hybridConfig 变（如重置 / HybridSearchConfig 直接改字段），同步本地视觉
  React.useEffect(() => {
    setLocalSlider(inferredSlider);
  }, [inferredSlider]);

  // 找到当前最近的锚点 label（用于副标题文案展示）
  const currentAnchor = React.useMemo(() => {
    if (isCustom) return null;
    return TAG_SLIDER_ANCHORS.find((a) => a.slider === localSlider) ?? null;
  }, [localSlider, isCustom]);

  // 当前档位描述文案（i18n key 在 Step 4.7 补齐）
  const description = React.useMemo(() => {
    if (isCustom) {
      return tt('tagWeightCustomDesc', 'Custom configuration (edit details in advanced hybrid config)');
    }
    if (!currentAnchor) return '';
    return tt(`${currentAnchor.label}Desc`, '');
  }, [isCustom, currentAnchor, tt]);

  // 当前档位短标签（在 Slider thumb 上方/Badge 显示）
  const currentLabel = React.useMemo(() => {
    if (isCustom) return tt('tagWeightCustom', 'Custom');
    if (!currentAnchor) return '';
    return tt(currentAnchor.label, currentAnchor.label);
  }, [isCustom, currentAnchor, tt]);

  // 处理拖动 / 键盘步进 — 仅更新本地视觉
  const handleChange = React.useCallback((v) => {
    setLocalSlider(v);
  }, []);

  // 释放后触发 commit（搜索 + 持久化）
  const handleChangeEnd = React.useCallback(
    (v) => {
      // 吸附到最近的锚点，让用户感觉 Slider "卡到 5 档"——即使是任意位置释放
      const nearestAnchor = TAG_SLIDER_ANCHORS.reduce((prev, cur) =>
        Math.abs(cur.slider - v) < Math.abs(prev.slider - v) ? cur : prev,
      );
      const snapped = nearestAnchor.slider;
      setLocalSlider(snapped);
      if (snapped !== inferredSlider || isCustom) {
        onCommit?.(snapped);
      }
    },
    [onCommit, inferredSlider, isCustom],
  );

  // 重置：拉回默认（slider=50）
  const handleReset = React.useCallback(() => {
    setLocalSlider(50);
    if (inferredSlider !== 50 || isCustom) {
      onCommit?.(50);
    }
  }, [onCommit, inferredSlider, isCustom]);

  const showResetButton = localSlider !== 50 || isCustom;

  // === LM CUSTOMIZATION: TagWeightSlider UX polish START ===
  // 5 档刻度全文字映射（短词 + i18n key）—— 替换原版的 `·` 占位，提升可扫读性
  const ANCHOR_SHORT_LABELS = {
    0:   { key: 'tagWeightOff',     fallback: 'Off' },
    25:  { key: 'tagWeightLoose',   fallback: 'Loose' },
    50:  { key: 'tagWeightDefault', fallback: 'Default' },
    75:  { key: 'tagWeightTagFav',  fallback: 'Tag-fav' },
    100: { key: 'tagWeightStrict',  fallback: 'Strict' },
  };

  // SliderMark 的基础样式（不带"是否当前档"的高亮态）
  const markBaseSx = {
    mt: '10px',
    fontSize: '9px',
    color: 'whiteAlpha.500',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    transition: 'color 160ms ease, font-weight 160ms ease',
  };
  const markActiveSx = {
    ...markBaseSx,
    fontSize: '10px',
    color: '#FFD230',
    fontWeight: 700,
  };

  // 当前档位徽章文案（"默认 · 50" / "Custom"）
  const badgeText = isCustom
    ? tt('tagWeightCustom', 'Custom')
    : `${currentLabel}${currentLabel ? ' · ' : ''}${localSlider}`;
  // === LM CUSTOMIZATION: TagWeightSlider UX polish END ===

  return (
    <FormControl isDisabled={isDisabled}>
      {/* === LM CUSTOMIZATION: TagWeightSlider UX polish START ===
           顶部标题行：标题 + 当前档位徽章 + 重置按钮
           — 徽章替代了原本的"Custom"独立 Badge（Custom 时改为黄色填充强提示） */}
      <HStack justify="space-between" align="center" mb={3}>
        <HStack spacing={2} minW={0}>
          <FormLabel fontSize="sm" mb={0} fontWeight="medium" whiteSpace="nowrap">
            {tt('tagWeightLabel', 'Tag matching weight')}
          </FormLabel>
          <Tooltip
            label={
              isCustom
                ? tt('tagWeightCustomTip', 'Edit details in advanced hybrid config')
                : tt('tagWeightAnchorTip', 'Snap-to-anchor preset')
            }
            placement="top"
            hasArrow
          >
            <Badge
              colorScheme="yellow"
              variant={isCustom ? 'solid' : 'subtle'}
              fontSize="10px"
              px={2}
              py={0.5}
              borderRadius="full"
              cursor="help"
              flexShrink={0}
            >
              {badgeText}
            </Badge>
          </Tooltip>
        </HStack>
        {showResetButton && (
          <Tooltip label={tt('resetToDefault', 'Reset to default')} placement="top" hasArrow>
            <IconButton
              aria-label={tt('resetToDefault', 'Reset to default')}
              icon={<RepeatIcon />}
              size="xs"
              variant="ghost"
              colorScheme="whiteAlpha"
              onClick={handleReset}
            />
          </Tooltip>
        )}
      </HStack>

      {/* Slider 主体 + 5 档刻度（全文字，当前档金色加粗）
           轨道用灰→金渐变作为底色，强化"权重越右越严格"的视觉语义 */}
      <Box px={3} pb={7} pt={1}>
        <Slider
          aria-label={tt('tagWeightLabel', 'Tag matching weight')}
          aria-valuetext={`${localSlider} — ${currentLabel}`}
          value={localSlider}
          min={0}
          max={100}
          step={1}
          colorScheme="yellow"
          onChange={handleChange}
          onChangeEnd={handleChangeEnd}
          isDisabled={isDisabled}
          focusThumbOnChange={false}
        >
          {/* 5 档刻度（位置 0/25/50/75/100，全部显示文字） */}
          {TAG_SLIDER_ANCHORS.map((anchor) => {
            const meta = ANCHOR_SHORT_LABELS[anchor.slider];
            const isActive = !isCustom && anchor.slider === localSlider;
            return (
              <SliderMark
                key={anchor.slider}
                value={anchor.slider}
                sx={isActive ? markActiveSx : markBaseSx}
              >
                {tt(meta.key, meta.fallback)}
              </SliderMark>
            );
          })}
          <SliderTrack
            h="6px"
            borderRadius="full"
            bgGradient="linear(to-r, rgba(255,255,255,0.10) 0%, rgba(255,210,48,0.35) 100%)"
          >
            <SliderFilledTrack bg="#FFD230" />
          </SliderTrack>
          <SliderThumb
            boxSize={4}
            bg="#FFD230"
            border="2px solid rgba(20,20,22,0.9)"
            _focusVisible={{ boxShadow: '0 0 0 3px rgba(255,210,48,0.45)' }}
            _hover={{ transform: 'scale(1.08)' }}
            transition="transform 120ms ease, box-shadow 120ms ease"
          />
        </Slider>
      </Box>

      {/* 当前档位描述（固定 18px 高度避免空内容时的高度抖动） */}
      <Text
        fontSize="xs"
        color={isCustom ? 'orange.300' : 'whiteAlpha.700'}
        minH="18px"
        lineHeight="18px"
        px={1}
      >
        {description}
      </Text>
      {/* === LM CUSTOMIZATION: TagWeightSlider UX polish END === */}
    </FormControl>
  );
}
// === LM CUSTOMIZATION: TagWeightSlider END ===
