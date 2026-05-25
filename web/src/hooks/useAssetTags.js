/**
 * useAssetTags - Group B 统一 tag hook（包装 useTagManager 并标准化输出）
 *
 * 设计目的：
 *   - 为 <CardTagBar> 和 <AssetTagEditor> 提供统一的 tag 读写 API
 *   - 屏蔽 useTagManager 内部 status 字段（pending/normal/removing/failed）的复杂性，
 *     对外只暴露用户关心的内容：字符串 tag 列表 + 增删函数 + loading/错误态
 *   - 跨组件同步：通过模块级 tagBus（EventTarget）在同一 assetPath 上发布 "tags 变更" 事件，
 *     同一资产的多个 hook 实例可以订阅事件后强制 re-pull（弱同步）。
 *     强同步（同一 useTagManager state 实例）通过 DrawerTagsSyncContext 在 UI 层实现。
 *
 * 与现有 hook 的关系：
 *   - useTagManager（hooks/useTagManager.js）：单 asset 实际网络读写 + 错误恢复，B 直接复用
 *   - useGlobalTags（hooks/useGlobalTags.js）：全局 tag 候选库（5 分钟缓存），B 在 TagEditPopover 中复用
 *
 * 不修改 useTagManager 内部，零侵入。
 *
 * @param {object} params
 * @param {object} params.asset - 资产对象（来自搜索结果或 Drawer），至少需含 url / source.url / source.base_key
 * @param {string} params.serverUrl - 当前 nucleus 服务器 URL（HybridDeepSearchUI 的 selectedServer）
 * @param {Function} params.getHeaders - 鉴权头工厂函数
 * @param {string} params.apiUrl - API base URL（reindex 用）
 * @returns {{
 *   tags: string[],                 // 字符串数组，过滤掉 removing 状态
 *   tagsWithStatus: Array<{name, status}>,  // 完整对象，供 UI 渲染 failed 红色 chip 等
 *   addTag: (tagName: string) => void,
 *   addMultipleTags: (names: string[]) => void,
 *   removeTag: (tagName: string) => void,
 *   isLoading: boolean,
 *   hasWritePermission: boolean,
 *   lastError: object | null,
 *   clearLastError: () => void,
 *   retryFailedTag: (tagName: string) => void,
 * }}
 */

// === LM CUSTOMIZATION: i18n START ===
// 本文件是 Group B 新增的 hook，新建文件按 NVIDIA 合入规则不需要 LM 标记。
// 这里仅保留 i18n 标记一致性供后续维护检索。
// === LM CUSTOMIZATION: i18n END ===

import { useEffect, useMemo, useCallback } from 'react';
import useTagManager from './useTagManager';
import useTagDeleteUndo from './useTagDeleteUndo';

// ─── 模块级事件总线（供同 assetPath 的多个实例做"提示性"刷新）─────────
// 真正的强同步走 React Context（DrawerTagsSyncContext），本 bus 只用于：
//   1) 跨 worktree 切服务器后的 cache 失效信号
//   2) 未来扩展（例如多页签场景的 BroadcastChannel）
const tagBus = typeof window !== 'undefined' && typeof window.EventTarget === 'function'
  ? new EventTarget()
  : null;

const EVENT_NAME = 'asset-tags-changed';

/** 派发"某 asset 的 tags 已变更"事件（其他订阅者可选择性 refresh） */
export function notifyAssetTagsChanged(assetPath, snapshot) {
  if (!tagBus || !assetPath) return;
  try {
    tagBus.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: { assetPath, snapshot, ts: Date.now() },
    }));
  } catch (_) { /* 老浏览器忽略 */ }
}

/** 订阅"某 asset 的 tags 变更"事件，返回 unsubscribe */
export function subscribeAssetTagsChanged(assetPath, listener) {
  if (!tagBus || !assetPath) return () => {};
  const handler = (e) => {
    if (e.detail?.assetPath === assetPath) listener(e.detail);
  };
  tagBus.addEventListener(EVENT_NAME, handler);
  return () => tagBus.removeEventListener(EVENT_NAME, handler);
}

/** 从 asset 对象提取规范化路径与 URL（容错，缺失字段时返回空串） */
function resolveAssetIdentity(asset) {
  if (!asset || typeof asset !== 'object') {
    return { assetPath: '', assetUrl: '', initialTags: [] };
  }
  // 与 EditableTagsPanel 同步：优先取 source.url > source.base_key > url
  const assetUrl =
    asset?.source?.url ||
    asset?.source?.base_key ||
    asset?.url ||
    '';
  // assetPath 给 useTagManager 的 normalizeAssetPath 使用（它内部会去掉 omniverse:// 前缀）
  const assetPath = assetUrl;
  // initialTags：兼容字符串数组与对象数组（{ tag, value, name } 各种历史格式）
  const rawTags = Array.isArray(asset?.tags) ? asset.tags : (Array.isArray(asset?.source?.tags) ? asset.source.tags : []);
  const initialTags = rawTags
    .map(t => {
      if (typeof t === 'string') return t;
      if (t && typeof t === 'object') return t.name || t.tag || t.value || '';
      return '';
    })
    .filter(Boolean);
  return { assetPath, assetUrl, initialTags };
}

export default function useAssetTags({ asset, serverUrl, getHeaders, apiUrl }) {
  const { assetPath, assetUrl, initialTags } = useMemo(
    () => resolveAssetIdentity(asset),
    [asset],
  );

  // 把 initialTags 数组稳定化（避免 useTagManager 内部 useEffect 因引用变化重置 tags）
  const stableInitialTags = useMemo(
    () => initialTags,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialTags.join('|')],
  );

  const tm = useTagManager({
    serverUrl,
    assetPath,
    initialTags: stableInitialTags,
    getHeaders,
    apiUrl,
    assetUrl,
  });

  // ─── 撤销删除 toast：默认对所有 removeTag 调用提供 5s 撤销窗口 ─────
  // 调用方零改动获得撤销能力；批量场景可传 { silent: true } 跳过。
  const { deleteWithUndo, showDeleteFailed } = useTagDeleteUndo();

  // ─── 包一层：广播事件（让同 assetPath 的其他订阅者知道）──────────
  const broadcastChange = useCallback((snapshot) => {
    if (assetPath) notifyAssetTagsChanged(assetPath, snapshot);
  }, [assetPath]);

  const addTag = useCallback((tagName) => {
    if (!tagName || typeof tagName !== 'string') return;
    tm.addTag(tagName);
    // 用最新 tagsRef snapshot；useTagManager 是异步的，这里用乐观快照
    broadcastChange([...(tm.tags?.map(t => t.name || t) || []), tagName]);
  }, [tm, broadcastChange]);

  const addMultipleTags = useCallback((names) => {
    if (!Array.isArray(names) || names.length === 0) return;
    tm.addMultipleTags(names);
    broadcastChange([...(tm.tags?.map(t => t.name || t) || []), ...names]);
  }, [tm, broadcastChange]);

  // removeTag 现在默认走撤销 toast 流程；
  //   silent=true → 跳过 toast 直接删（用于批量场景 / 程序化清理）
  const removeTag = useCallback((tagName, options) => {
    if (!tagName) return;
    const silent = options && options.silent === true;

    // 立即从 UI 上移除（乐观更新，useTagManager 内部已实现）
    tm.removeTag(tagName);
    const next = (tm.tags || []).filter(t => (t.name || t) !== tagName).map(t => t.name || t);
    broadcastChange(next);

    if (silent) return;

    // 弹撤销 toast
    deleteWithUndo({
      tagName,
      onConfirmedDelete: undefined, // 5s 到点：useTagManager 已经把删除写到后端，无需额外动作
      onUndo: async () => {
        // 撤销 = 重新添加 tag（走标准 addTag 路径，自带后端写 + 广播）
        try {
          tm.addTag(tagName);
          // 同样广播一次
          broadcastChange([...(tm.tags?.map(t => t.name || t) || []), tagName]);
          return tagName;
        } catch (e) {
          showDeleteFailed(tagName);
          throw e;
        }
      },
    });
  }, [tm, broadcastChange, deleteWithUndo, showDeleteFailed]);

  // ─── 输出标准化：把 useTagManager 的 [{name, status, ...}] 转为字符串数组 ─
  const tagStrings = useMemo(() => {
    if (!Array.isArray(tm.tags)) return [];
    return tm.tags
      .filter(t => t && t.status !== 'removing')
      .map(t => (typeof t === 'string' ? t : (t.name || t.tag || '')))
      .filter(Boolean);
  }, [tm.tags]);

  // 监听 server-changed → useTagManager 内部已通过 effectiveServerUrl 处理；这里仅冗余日志
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onServerChanged = () => {
      // useTagManager 自身会在 effectiveServerUrl 变化时 re-init；这里无需手动处理
      // 仅广播一个变更事件提示订阅者
      if (assetPath) notifyAssetTagsChanged(assetPath, []);
    };
    window.addEventListener('server-changed', onServerChanged);
    return () => window.removeEventListener('server-changed', onServerChanged);
  }, [assetPath]);

  return {
    // 字符串数组（B 内部组件首选）
    tags: tagStrings,
    // 完整对象（含 status，供 UI 渲染 failed/pending）
    tagsWithStatus: tm.tags || [],
    addTag,
    addMultipleTags,
    removeTag,
    isLoading: !!tm.isLoading,
    hasWritePermission: tm.hasWritePermission !== false, // useTagManager 默认 true
    lastError: tm.lastError || null,
    clearLastError: tm.clearLastError || (() => {}),
    retryFailedTag: tm.retryFailedTag || (() => {}),
    // 暴露原始 tm 用于高级用法（AssetTagEditor 中需要 suggestions 等）
    _tm: tm,
  };
}
