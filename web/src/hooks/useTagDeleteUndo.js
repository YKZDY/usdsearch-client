/**
 * useTagDeleteUndo - Tag 删除撤销 hook（Group B / LA Customization）
 *
 * 设计目标：
 *   用户在卡片或 Drawer 删除 tag 后弹出右下角 toast，提供 5 秒撤销窗口。
 *   - 5 秒内点 [撤销] / 按 Ctrl+Z / ⌘Z → 调 addTag(tagName) 把 tag 加回去
 *   - 5 秒到点未操作 → 删除生效（删除本身已经在调用方完成，这里只是不再恢复）
 *   - 鼠标 hover toast 暂停倒计时；移开恢复（用户正想点撤销时不被打断）
 *   - 连续删除多个 tag → 单例 toast：旧 toast 立即关闭，新 toast 接管
 *     不会在右下角堆出"toast 柱子"
 *   - 撤销成功 → 弹一个 2 秒短反馈"已恢复 X"，闭环
 *   - 删除失败（addTag 抛错或返回 false） → toast 改红 + 自动恢复 tag
 *
 * 与现有架构的关系：
 *   - useAssetTags.removeTag 调用方注入本 hook 的 deleteWithUndo()
 *   - 实际的 tag 增删走 useTagManager（已存在的标准链路）
 *   - 不引入新的状态机，撤销 = "再 addTag 一次"
 *
 * 新文件按 NVIDIA 合入安全规则不需要 LM CUSTOMIZATION 标记。
 *
 * @module hooks/useTagDeleteUndo
 */

import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '@chakra-ui/react';
import TagDeleteUndoToast from '../components/TagDeleteUndoToast';
import { useTranslation } from '../i18n/LanguageContext';

// ─── 配置常量 ─────────────────────────────────────────────
/** 撤销时间窗（毫秒）。Material Snackbar 6s / Slack 5s / Gmail 5s — 取业界主流 5s */
const UNDO_DURATION_MS = 5000;
/** 撤销成功后的反馈 toast 持续时长 */
const RESTORED_FEEDBACK_MS = 2000;
/** 失败 toast 持续时长（用户需要看清错误） */
const FAILED_TOAST_MS = 4000;
/** 单例 toast id 前缀；每次唯一化拼时间戳避免 chakra AnimatePresence 退场动画期间的 key 冲突 */
const SINGLETON_TOAST_ID_PREFIX = 'tag-delete-undo-toast';

/**
 * 检测当前是否 macOS（决定快捷键提示文案 ⌘Z vs Ctrl+Z）
 * 不依赖 navigator.platform deprecated API，优先 navigator.userAgentData
 */
function isMacPlatform() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgentData?.platform) {
    return navigator.userAgentData.platform === 'macOS';
  }
  return /Mac|iPhone|iPad/i.test(navigator.platform || '');
}

/**
 * useTagDeleteUndo
 *
 * @returns {{ deleteWithUndo: (params: {
 *   tagName: string,
 *   onConfirmedDelete?: () => void,   // 5s 到点未撤销时回调（可选，写后端日志等）
 *   onUndo: () => Promise<void>|void, // 用户点撤销时回调（必填，应调 addTag）
 * }) => void }}
 */
export default function useTagDeleteUndo() {
  const toast = useToast();
  const { t } = useTranslation();

  // ─── 单例状态（用 ref 避免 re-render） ──────────────────
  /** 当前活跃 toast 的撤销回调；为空表示没有可撤销项 */
  const activeUndoRef = useRef(null);
  /** 当前活跃 toast 的实际 id（chakra 用 timestamp 唯一化避免 key 冲突） */
  const activeToastIdRef = useRef(null);
  /** 当前倒计时的 setTimeout id */
  const timerIdRef = useRef(null);
  /** 倒计时剩余毫秒数（用于 hover 暂停后续传） */
  const timerRemainingRef = useRef(0);
  /** 倒计时启动时间戳（用于计算剩余） */
  const timerStartedAtRef = useRef(0);

  // 清理当前活跃倒计时（不关 toast，调用方按需关）
  const clearActiveTimer = useCallback(() => {
    if (timerIdRef.current != null) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
  }, []);

  // 提交"删除"（5 秒到点）
  const commitDelete = useCallback((onConfirmedDelete) => {
    activeUndoRef.current = null;
    clearActiveTimer();
    const id = activeToastIdRef.current;
    if (id != null && toast.isActive(id)) {
      toast.close(id);
    }
    activeToastIdRef.current = null;
    if (typeof onConfirmedDelete === 'function') {
      try { onConfirmedDelete(); } catch (e) { /* ignore */ }
    }
  }, [toast, clearActiveTimer]);

  // 启动倒计时
  const startTimer = useCallback((durationMs, onConfirmedDelete) => {
    clearActiveTimer();
    timerRemainingRef.current = durationMs;
    timerStartedAtRef.current = Date.now();
    timerIdRef.current = setTimeout(() => {
      commitDelete(onConfirmedDelete);
    }, durationMs);
  }, [clearActiveTimer, commitDelete]);

  // 暂停倒计时（hover 进入）
  const pauseTimer = useCallback(() => {
    if (timerIdRef.current == null) return;
    clearTimeout(timerIdRef.current);
    timerIdRef.current = null;
    const elapsed = Date.now() - timerStartedAtRef.current;
    timerRemainingRef.current = Math.max(0, timerRemainingRef.current - elapsed);
  }, []);

  // 恢复倒计时（hover 离开）
  const resumeTimer = useCallback((onConfirmedDelete) => {
    if (timerIdRef.current != null) return; // 已在倒计时
    if (timerRemainingRef.current <= 0) {
      commitDelete(onConfirmedDelete);
      return;
    }
    timerStartedAtRef.current = Date.now();
    timerIdRef.current = setTimeout(() => {
      commitDelete(onConfirmedDelete);
    }, timerRemainingRef.current);
  }, [commitDelete]);

  // 执行撤销
  const performUndo = useCallback(async () => {
    const undo = activeUndoRef.current;
    if (!undo) return;
    activeUndoRef.current = null;
    clearActiveTimer();
    const id = activeToastIdRef.current;
    if (id != null && toast.isActive(id)) {
      toast.close(id);
    }
    activeToastIdRef.current = null;
    let restoredTag = '';
    let failed = false;
    try {
      restoredTag = await undo();
    } catch (e) {
      failed = true;
    }
    if (failed) return; // addTag 失败，调用方应自己再弹错误提示

    // 已恢复反馈
    toast({
      position: 'bottom-right',
      duration: RESTORED_FEEDBACK_MS,
      isClosable: true,
      status: 'success',
      title: t('tagBar.deleted.restored', { tag: restoredTag || '' }),
      variant: 'subtle',
    });
  }, [toast, clearActiveTimer, t]);

  // ─── 全局 Ctrl/Cmd+Z 监听 ──────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!activeUndoRef.current) return;
      const key = e.key?.toLowerCase();
      if (key !== 'z') return;
      const isModifier = e.ctrlKey || e.metaKey;
      if (!isModifier) return;
      // 排除 Shift+Ctrl+Z（Redo），我们只接管 Undo
      if (e.shiftKey) return;
      // 排除编辑态：用户在 input/textarea/contentEditable 里按 Ctrl+Z 应该让浏览器原生处理
      const target = e.target;
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      performUndo();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [performUndo]);

  // ─── 卸载时清理（防内存泄漏） ───────────────────────────
  useEffect(() => () => {
    clearActiveTimer();
    activeUndoRef.current = null;
  }, [clearActiveTimer]);

  // ─── 对外接口 ────────────────────────────────────────
  const deleteWithUndo = useCallback(({ tagName, onConfirmedDelete, onUndo }) => {
    if (!tagName || typeof onUndo !== 'function') return;

    // 单例：如果已有活跃撤销项 → 立即提交它（用户已经移交注意力到新删除）
    if (activeUndoRef.current) {
      const prevConfirm = activeUndoRef.current.confirm;
      commitDelete(prevConfirm);
    }

    // 注册新撤销项
    activeUndoRef.current = async () => {
      const r = await onUndo();
      // onUndo 应返回被恢复的 tag 名（或 undefined，回退到 tagName）
      return r || tagName;
    };
    activeUndoRef.current.confirm = onConfirmedDelete;

    const undoHintKey = isMacPlatform()
      ? 'tagBar.deleted.undoHintMac'
      : 'tagBar.deleted.undoHint';

    // 弹 toast 替换旧的：
    //   chakra v2 + framer-motion AnimatePresence 在退场动画(~200ms)期间会保留旧 toast 的 key,
    //   如果新 toast 用同一 id push 进 ToastManager,React 会报"two children with same key",
    //   且新 toast 反而被合并/丢弃。这里改用 timestamp 唯一化 id。
    const prevId = activeToastIdRef.current;
    if (prevId != null && toast.isActive(prevId)) {
      toast.close(prevId);
    }
    const newId = `${SINGLETON_TOAST_ID_PREFIX}-${Date.now()}`;
    activeToastIdRef.current = newId;

    toast({
      id: newId,
      position: 'bottom-right',
      duration: null, // 我们自己控制倒计时，禁用 chakra 的自动关闭
      isClosable: false, // 关闭按钮放在自定义 render 里
      render: ({ onClose }) => (
        <TagDeleteUndoToast
          tagName={tagName}
          title={t('tagBar.deleted.title')}
          undoLabel={t('tagBar.deleted.undo')}
          undoHint={t(undoHintKey)}
          closeAriaLabel={t('tagBar.deleted.closeAriaLabel')}
          durationMs={UNDO_DURATION_MS}
          onUndo={() => {
            performUndo();
          }}
          onClose={() => {
            commitDelete(onConfirmedDelete);
            onClose();
          }}
          onPause={pauseTimer}
          onResume={() => resumeTimer(onConfirmedDelete)}
        />
      ),
    });

    // 启动倒计时
    startTimer(UNDO_DURATION_MS, onConfirmedDelete);
  }, [toast, t, commitDelete, performUndo, pauseTimer, resumeTimer, startTimer]);

  // ─── 失败回退：调用方在 addTag 失败时调用 ─────────────────
  const showDeleteFailed = useCallback((tagName) => {
    const id = activeToastIdRef.current;
    if (id != null && toast.isActive(id)) {
      toast.close(id);
    }
    activeToastIdRef.current = null;
    activeUndoRef.current = null;
    clearActiveTimer();
    toast({
      position: 'bottom-right',
      duration: FAILED_TOAST_MS,
      isClosable: true,
      status: 'error',
      title: t('tagBar.deleted.failed', { tag: tagName }),
      variant: 'left-accent',
    });
  }, [toast, t, clearActiveTimer]);

  return { deleteWithUndo, showDeleteFailed };
}
