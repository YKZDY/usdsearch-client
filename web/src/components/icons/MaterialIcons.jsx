/**
 * MaterialIcons — 项目内复用的 Material Design 图标公共模块
 *
 * 设计目标
 *  - 用 Chakra <Icon> 包裹 inline SVG <path>，currentColor 跟随父级 color，无需额外样式
 *  - **零新依赖**：项目未装 react-icons，避免引入第三方库（合入安全 + 节省体积）
 *  - 集中管理：未来再有 Material 图标需求（排序/筛选/视图切换等），都加到本文件
 *
 * 来源
 *  - Material Design Icons（Apache-2.0），可商用、可再分发
 *
 * 使用示例
 *    import { TuneIcon } from './icons/MaterialIcons';
 *    <IconButton icon={<TuneIcon boxSize={4} />} />
 *
 * 合入安全
 *  - 全新文件，不修改 NVIDIA 原版任何文件
 *  - 不需要 LM CUSTOMIZATION 标记（路径 components/icons/ 是 LM 新增子目录）
 */

import React from 'react';
import { Icon } from '@chakra-ui/react';

/**
 * Tune（滑块/调节器）图标 — 三条横线 + 圆形旋钮
 * 语义："调节参数 / 自定义配置"，与齿轮（系统设置）形成区分。
 * 用途：搜索设置（HeaderIcons 顶栏触发器），区别于 FabToolbar 的视图设置齿轮。
 */
export const TuneIcon = (props) => (
    <Icon viewBox="0 0 24 24" {...props}>
        <path
            fill="currentColor"
            d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"
        />
    </Icon>
);

export default {
    TuneIcon,
};
