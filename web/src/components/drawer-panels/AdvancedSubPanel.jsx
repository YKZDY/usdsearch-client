/**
 * AdvancedSubPanel — Drawer 高级面板内的"二级折叠子项"通用壳
 *
 * 提供统一的视觉规范（fabTokens 驱动），消除 Modal 中的 #FFD230 / gray.750 硬编码：
 *  - 标题：fabTypo.eyebrow.sm 风格（小写 / textSecondary / 字间距 0.06em）
 *  - 内容：bgElevatedHigh 背景，fabRadius['1.5'] 圆角（6px），fabSpacing['3'] 内边距（12px）
 *  - hover：标题行平滑过渡到 bgElevatedHigh（150ms）
 *  - 箭头：14px ChevronRight / ChevronDown
 *  - 子项之间：fabSpacing['2']（8px）垂直间距由父容器控制
 *
 * 用法：
 *   <AdvancedSubPanel
 *     title={t('dependencies')}
 *     count={deps?.nodes?.length}                // 可选，标题右侧 badge
 *     defaultOpen={false}
 *     onToggleOpen={(next) => next && load()}    // 懒加载入口
 *   >
 *     <DependenciesContent />
 *   </AdvancedSubPanel>
 */

import React from "react";
import { Box, HStack, Text, Collapse, Badge, useDisclosure } from "@chakra-ui/react";
import { ChevronRightIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { fabColors, fabRadius, fabSpacing } from "../../theme/fabTokens";

const AdvancedSubPanel = ({
  title,
  count,
  defaultOpen = false,
  onToggleOpen,
  rightAccessory, // 标题右侧自定义节点（如刷新图标按钮）
  children,
  testId,
}) => {
  const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: defaultOpen });

  const handleToggle = () => {
    const next = !isOpen;
    onToggle();
    if (typeof onToggleOpen === "function") {
      // 触发懒加载（仅当从关到开时调用，外部按需自处理）
      onToggleOpen(next);
    }
  };

  return (
    <Box data-testid={testId} role="group">
      <HStack
        as="button"
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        w="100%"
        spacing={fabSpacing["2"]}
        px={fabSpacing["2"]}
        py={fabSpacing["1.5"]}
        borderRadius={fabRadius["1"]}
        cursor="pointer"
        bg="transparent"
        transition="background-color 150ms ease"
        _hover={{ bg: fabColors.bgElevatedHigh }}
        _focusVisible={{
          outline: "2px solid",
          outlineColor: fabColors.borderFocus,
          outlineOffset: "2px",
        }}
      >
        <Box as="span" display="inline-flex" alignItems="center" justifyContent="center" w="14px" h="14px">
          {isOpen ? (
            <ChevronDownIcon boxSize="14px" color={fabColors.textSecondary} />
          ) : (
            <ChevronRightIcon boxSize="14px" color={fabColors.textSecondary} />
          )}
        </Box>
        <Text
          flex="1"
          textAlign="left"
          fontSize="11px"
          fontWeight="600"
          letterSpacing="0.06em"
          textTransform="uppercase"
          color={fabColors.textSecondary}
          noOfLines={1}
        >
          {title}
        </Text>
        {typeof count === "number" && count > 0 && (
          <Badge
            variant="subtle"
            bg={fabColors.fillSecondaryDefault}
            color={fabColors.textPrimary}
            borderRadius={fabRadius["round"]}
            px={fabSpacing["2"]}
            fontSize="10px"
            fontWeight="600"
          >
            {count}
          </Badge>
        )}
        {rightAccessory ? (
          <Box
            onClick={(e) => e.stopPropagation()}
            // 让右侧自定义节点（如 IconButton）独立处理点击，不触发折叠
          >
            {rightAccessory}
          </Box>
        ) : null}
      </HStack>
      <Collapse in={isOpen} animateOpacity>
        <Box
          mt={fabSpacing["1.5"]}
          p={fabSpacing["3"]}
          bg={fabColors.bgElevatedHigh}
          borderRadius={fabRadius["1.5"]}
          border="1px solid"
          borderColor={fabColors.borderFaint}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
  );
};

export default React.memo(AdvancedSubPanel);
