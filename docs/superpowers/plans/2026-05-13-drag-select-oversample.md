# 框选启动点扩展 + 搜索过采样 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Let users start drag-select from anywhere on the page (sidebar, toolbar empty space), not just from the results scroll container. (2) Oversample API requests so client-side filters don't reduce visible results below the user-requested limit.

**Architecture:** The drag-select hook (`useDragSelect`) will switch from a container-prop-based mousedown to a document-level event listener (matching its existing mousemove/mouseup pattern). An interactive-element exclusion check prevents interference with buttons/inputs/tree-items. For oversampling, a utility function calculates a dynamic factor based on active filters, the search request multiplies the user limit, and results are truncated back to the user limit after client-side filtering. A tooltip warns when results are fewer than requested.

**Tech Stack:** React 18, Chakra UI v2, existing useDragSelect hook, existing i18n system.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `web/src/hooks/useDragSelect.js` | Modify | Lift mousedown to document; add modal/interactive exclusion |
| `web/src/HybridSearchResults.jsx` | Modify | Remove `onMouseDown` prop from container Box |
| `web/src/components/VirtualizedHybridSearchResults.jsx` | Modify | Remove `onMouseDown` prop from VirtualizedResults |
| `web/src/components/VirtualizedResults.jsx` | Modify | Remove `onMouseDown` prop passthrough |
| `web/src/utils/oversample.js` | Create | `getOversampleFactor()` pure utility |
| `web/src/HybridDeepSearchUI.jsx` | Modify | Use oversample factor on API limit; truncate visibleResults; pass shortage info |
| `web/src/components/ResultsTitleBar.jsx` | Modify | Show tooltip when results are fewer than requested |
| `web/src/i18n/zh.js` | Modify | Add shortage hint string |
| `web/src/i18n/en.js` | Modify | Add shortage hint string |
| `web/src/index.js` | Modify | Add `data-drag-select-skip` to top bar |

---

### Task 1: Lift useDragSelect mousedown to document level

**Files:**
- Modify: `web/src/hooks/useDragSelect.js`

- [ ] **Step 1: Add interactive-element exclusion helper**

Add this function at the top of the file (after `const DRAG_THRESHOLD = 8;`):

```javascript
/**
 * 判断 target 元素是否为交互控件（不应启动框选的元素）
 * 包括：按钮、输入框、链接、树节点、Modal 等
 */
function isInteractiveElement(el) {
  if (!el || el === document || el === document.body) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') return true;
  if (el.isContentEditable) return true;
  if (el.closest?.('[data-drag-select-skip="true"]')) return true;
  const role = el.getAttribute?.('role');
  if (role === 'treeitem' || role === 'button' || role === 'switch' || role === 'slider' ||
      role === 'menuitem' || role === 'option' || role === 'tab') return true;
  if (el.closest?.('label')) return true;
  return false;
}

/**
 * 判断当前是否有 Modal/Popover 打开（这些情况下不启动框选）
 */
function isModalOpen() {
  return !!(
    document.querySelector('.chakra-modal__overlay') ||
    document.querySelector('[data-chakra-modal]') ||
    document.querySelector('[role="dialog"][aria-modal="true"]')
  );
}
```

- [ ] **Step 2: Refactor handleMouseDown — remove container.contains gate, add document-level logic**

Replace the existing `handleMouseDown` callback (lines 177-226) with:

```javascript
  const handleMouseDown = useCallback((e) => {
    if (!enabled || e.button !== 0) return;
    if (!containerRef.current) return;

    // Modal 打开时完全不启动框选
    if (isModalOpen()) return;

    // 交互控件不拦截
    if (isInteractiveElement(e.target)) return;

    // 排除"点在滚动条上"的情况
    const container = containerRef.current;
    if (e.target === container) {
      const rect = container.getBoundingClientRect();
      if (e.clientX > rect.left + container.clientWidth) return;
      if (e.clientY > rect.top + container.clientHeight) return;
    }

    // 判断起点是否在容器内（用于区分 paint vs rect）
    const isInContainer = container.contains(e.target);
    const insideCard = isInContainer && isInsideCard(e.target);
    const baseSet = new Set(baseSelection || []);

    // 起点不在容器内且不在卡片内 → 一定是 rect 模式（外部空白起点）
    // 起点在容器内但不在卡片内 → rect 模式（缝隙起点）
    // 起点在卡片内 → paint 模式

    let paintMode = 'add';
    if (insideCard) {
      const startCard = findCardFromEl(e.target);
      if (startCard && baseSet.has(startCard.id)) {
        paintMode = 'remove';
      }
    }

    stateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      isActive: true,
      mode: null,
      startedInsideCard: insideCard,
      baseSet,
      paintedIds: new Set(),
      paintMode,
    };

    // 非卡片区域（含容器外空白）主动 preventDefault，阻止文本选区 & 原生拖拽
    if (!insideCard) {
      e.preventDefault();
    }
  }, [enabled, isInsideCard, containerRef, baseSelection, findCardFromEl]);
```

- [ ] **Step 3: Register mousedown on document (alongside existing mousemove/mouseup)**

Replace the existing useEffect (lines 323-335) with:

```javascript
  // 全局监听 mousedown/mousemove/mouseup
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e) => handleMouseDown(e);
    const onMove = (e) => handleMouseMove(e);
    const onUp = (e) => handleMouseUp(e);
    document.addEventListener('mousedown', onDown, true); // capture phase
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [enabled, handleMouseDown, handleMouseMove, handleMouseUp]);
```

- [ ] **Step 4: Remove handleMouseDown from the return value (no longer needed as prop)**

Change the return statement:

```javascript
  return {
    isDragging,
    selectionRect,
    // handleMouseDown removed — now registered via document listener
  };
```

- [ ] **Step 5: Add user-select: none to body during drag**

In `handleMouseMove`, after `setIsDragging(true)` (when mode is first determined), add:

```javascript
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
```

In `handleMouseUp`, after `setIsDragging(false)`, add:

```javascript
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
```

---

### Task 2: Remove onMouseDown prop from result containers

**Files:**
- Modify: `web/src/HybridSearchResults.jsx`
- Modify: `web/src/components/VirtualizedHybridSearchResults.jsx`
- Modify: `web/src/components/VirtualizedResults.jsx`

- [ ] **Step 1: Update HybridSearchResults.jsx**

At line 1007, update the useDragSelect destructure to remove `handleMouseDown`:

```javascript
  const { isDragging, selectionRect } = useDragSelect({
    containerRef: scrollContainerRef,
    items: results,
    getItemId,
    onSelectionChange: handleDragSelectionChange,
    baseSelection: selectedItems,
    enabled: FEATURE_FLAGS.NEW_CARD_INTERACTION,
  });
```

At line 1063, remove `onMouseDown={handleMouseDown}` from the Box:

```jsx
      <Box
        flex={1}
        minH={0}
        overflowY="auto"
        position="relative"
        ref={scrollContainerRef}
        style={{ userSelect: isDragging ? 'none' : 'auto' }}
      >
```

- [ ] **Step 2: Update VirtualizedHybridSearchResults.jsx**

At line 932, update the useDragSelect destructure:

```javascript
  const { isDragging, selectionRect } = useDragSelect({
    containerRef: scrollContainerRef,
    items: results,
    getItemId,
    onSelectionChange: handleDragSelectionChange,
    baseSelection: selectedItems,
    enabled: FEATURE_FLAGS.NEW_CARD_INTERACTION,
    onEmptyClick: handleEmptyClick,
  });
```

At line 1042, remove `onMouseDown={handleMouseDown}` from VirtualizedResults:

```jsx
        <VirtualizedResults
          ...
          scrollContainerRef={scrollContainerRef}
          style={{ userSelect: isDragging ? 'none' : 'auto' }}
        />
```

- [ ] **Step 3: Update VirtualizedResults.jsx**

Remove `onMouseDown` from the props destructure (line 38) and from the Box (line 196):

```jsx
// Props: remove onMouseDown from destructure
const VirtualizedResults = ({
  items,
  renderItem,
  itemHeight,
  containerHeight = 600,
  overscan = 5,
  gridMode = false,
  itemsPerRow = 1,
  itemWidth = 280,
  gap = 16,
  scrollContainerRef,
  ...props
}) => {
```

```jsx
    <Box
      ref={scrollElementRef}
      height={containerHeight}
      overflowY="auto"
      onScroll={handleScroll}
      position="relative"
      {...props}
    >
```

---

### Task 3: Add data-drag-select-skip to top search bar

**Files:**
- Modify: `web/src/index.js`

- [ ] **Step 1: Add data-drag-select-skip to the top bar container**

At line 1489 (the outer Box of the top bar), add the attribute:

```jsx
            <Box 
                w="100%" 
                h="72px" 
                bg="transparent"
                borderBottom="1px solid rgba(255,255,255,0.05)"
                position="sticky"
                top={0}
                zIndex={1100}
                backdropFilter="blur(12px)"
                backgroundColor="rgba(16,16,20,0.85)"
                data-drag-select-skip="true"
            >
```

This prevents all mousedown events within the top search bar (including image drag-drop zone) from being captured by useDragSelect.

---

### Task 4: Create oversample utility

**Files:**
- Create: `web/src/utils/oversample.js`

- [ ] **Step 1: Create the oversample factor calculation function**

```javascript
/**
 * 过采样系数计算 — 确保客户端过滤后仍有足够结果
 *
 * 当 showOnlyWithPreviews 或 file_extension_exclude 等客户端过滤开启时，
 * API 返回的结果会被二次过滤，导致显示数量 < 请求 limit。
 * 过采样通过放大请求 limit 来补偿过滤损耗。
 *
 * @param {Object} options
 * @param {boolean} options.showOnlyWithPreviews - 是否开启"仅含预览"过滤
 * @param {string} options.fileExtensionExclude - 逗号分隔的排除扩展名
 * @returns {number} 过采样系数 (1.0 ~ 3.0)
 */
export function getOversampleFactor({ showOnlyWithPreviews = false, fileExtensionExclude = '' } = {}) {
  let factor = 1.0;

  // 缩略图过滤：观测约 20-35% 结果无缩略图
  if (showOnlyWithPreviews) {
    factor *= 1.5;
  }

  // 格式排除：每种格式约增加 5% 损耗，上限 40%
  if (fileExtensionExclude && fileExtensionExclude.trim()) {
    const extCount = fileExtensionExclude.split(',').map(s => s.trim()).filter(Boolean).length;
    factor *= 1 + Math.min(extCount * 0.05, 0.4);
  }

  // 总上限 3.0（避免请求过大）
  return Math.min(factor, 3.0);
}

/**
 * 计算实际发送给 API 的 limit 值
 *
 * @param {number} userLimit - 用户设定的每页结果数
 * @param {Object} filterOptions - 当前过滤设置（传给 getOversampleFactor）
 * @returns {number} 实际 API limit（上限 10000）
 */
export function getApiLimit(userLimit, filterOptions) {
  const factor = getOversampleFactor(filterOptions);
  return Math.min(Math.ceil(userLimit * factor), 10000);
}
```

---

### Task 5: Integrate oversampling into search request

**Files:**
- Modify: `web/src/HybridDeepSearchUI.jsx`

- [ ] **Step 1: Add import for oversample utility**

After the existing imports (around line 97), add:

```javascript
import { getApiLimit } from "./utils/oversample";
```

- [ ] **Step 2: Replace hard-coded limit in search request with oversampled limit**

At line 2062, replace:

```javascript
        limit: parseInt(currentSearchParams.limit),
```

with:

```javascript
        limit: getApiLimit(
          parseInt(currentSearchParams.limit),
          {
            showOnlyWithPreviews,
            fileExtensionExclude: currentSearchParams.file_extension_exclude || '',
          }
        ),
```

Also apply the same change to the image/similar search request at line 1748 (where `limit: parseInt(currentSearchParams.limit)` appears):

```javascript
        limit: getApiLimit(
          parseInt(currentSearchParams.limit),
          {
            showOnlyWithPreviews,
            fileExtensionExclude: currentSearchParams.file_extension_exclude || '',
          }
        ),
```

- [ ] **Step 3: Add truncation to visibleResults and track shortage**

After the existing `visibleResults` useMemo (around line 456-465), add truncation logic. Replace the existing visibleResults memo:

```javascript
  // === LM CUSTOMIZATION: 统一可见结果数组 + 过采样截断 ===
  const userLimit = parseInt(searchParams.limit) || 50;
  
  const { visibleResults, isResultShortage, preFilterCount } = useMemo(() => {
    const base = showOnlyWithPreviews
      ? tagFilteredResults.filter(item => item?.thumbnail_exists === true)
      : tagFilteredResults;
    const filtered = base.filter(item => {
      const raw = item?.source?.path || item?.source?.base_key || item?.source?.url || '';
      if (!raw) return true;
      return !isNoisePath(String(raw));
    });
    
    // 过采样截断：过滤后结果可能超过用户请求的 limit（因为过采样请求了更多）
    const preCount = filtered.length;
    const truncated = filtered.length > userLimit ? filtered.slice(0, userLimit) : filtered;
    const shortage = truncated.length < userLimit && results.length > 0;
    
    return {
      visibleResults: truncated,
      isResultShortage: shortage,
      preFilterCount: preCount,
    };
  }, [tagFilteredResults, showOnlyWithPreviews, userLimit, results.length]);
```

Note: The old `visibleResults` was used standalone. Now it's destructured from the memo. All references to `visibleResults` in the rest of the file continue to work because the variable name stays the same.

- [ ] **Step 4: Pass shortage info to FabToolbar via titleBarProps**

Find where `titleBarProps` is constructed (search for `titleBarProps`). Add the shortage fields:

```javascript
  const titleBarProps = useMemo(() => ({
    // ...existing props...
    isResultShortage,
    userLimit,
  }), [/* ...existing deps..., */ isResultShortage, userLimit]);
```

---

### Task 6: Show shortage tooltip in ResultsTitleBar

**Files:**
- Modify: `web/src/components/ResultsTitleBar.jsx`
- Modify: `web/src/components/FabToolbar.jsx`

- [ ] **Step 1: Pass shortage props through FabToolbar to ResultsTitleBar**

In `FabToolbar.jsx`, add to the props destructure (around line 146):

```javascript
  // ...existing...
  resultCount = 0,
}) {
```

No change needed here — the `titleBarProps` object is passed through to `ResultsTitleBar` which reads directly from it. Find where `ResultsTitleBar` is rendered (line 225-233) and add the new props:

```jsx
          <ResultsTitleBar
            t={t}
            committedQuery={titleBarProps?.committedQuery || ''}
            categoryTag={titleBarProps?.categoryTag || ''}
            categoryLabel={titleBarProps?.categoryLabel || ''}
            onRemoveCategory={titleBarProps?.onRemoveCategory}
            onRemoveQuery={titleBarProps?.onRemoveQuery}
            imageSearchActive={titleBarProps?.imageSearchActive || false}
            resultCount={resultCount}
            scoreRange={titleBarProps?.scoreRange || null}
            isResultShortage={titleBarProps?.isResultShortage || false}
            userLimit={titleBarProps?.userLimit || 0}
          />
```

- [ ] **Step 2: Update ResultsTitleBar to show tooltip on shortage**

In `web/src/components/ResultsTitleBar.jsx`, update props and add tooltip:

Add to the function signature:

```javascript
function ResultsTitleBar({
  committedQuery = '',
  categoryTag = '',
  categoryLabel = '',
  onRemoveCategory,
  onRemoveQuery,
  imageSearchActive = false,
  t,
  resultCount = 0,
  scoreRange = null,
  isResultShortage = false,
  userLimit = 0,
}) {
```

Replace the count rendering section (lines 132-139) with:

```jsx
      {/* 计数（永远显示，数字变化走 AnimatedCount 做 300ms 过渡） */}
      <span className="results-title-count">
        {countParts[0]}
        <span className="results-title-count-number">
          <AnimatedCount value={resultCount} />
        </span>
        {countParts[1] || ''}
        {isResultShortage && (
          <span
            className="results-title-shortage-hint"
            title={
              t?.('resultShortageHint')
                ?.replace('{requested}', String(userLimit))
                ?.replace('{actual}', String(resultCount))
              || `已请求 ${userLimit} 条，当前过滤条件下仅找到 ${resultCount} 条。可尝试关闭"仅含预览"或调整格式过滤获取更多结果。`
            }
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="currentColor"
              style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '4px', opacity: 0.6 }}
            >
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h1.25v4.5h1.25v1H6.5v-1h1.25V8H6.5V7z"/>
            </svg>
          </span>
        )}
      </span>
```

- [ ] **Step 3: Add CSS for the shortage hint**

In `web/src/components/ResultsTitleBar.css`, add:

```css
.results-title-shortage-hint {
  cursor: help;
  color: rgba(255, 210, 48, 0.7);
  transition: color 0.15s ease;
}
.results-title-shortage-hint:hover {
  color: rgba(255, 210, 48, 1);
}
```

---

### Task 7: Add i18n strings

**Files:**
- Modify: `web/src/i18n/zh.js`
- Modify: `web/src/i18n/en.js`

- [ ] **Step 1: Add Chinese string**

After the `resultsTotalCount` line (line 252 in zh.js), add:

```javascript
  resultShortageHint: "已请求 {requested} 条，当前过滤条件下仅找到 {actual} 条。可尝试关闭"仅含预览"或调整格式过滤获取更多结果。",
```

- [ ] **Step 2: Add English string**

After the `resultsTotalCount` line (line 252 in en.js), add:

```javascript
  resultShortageHint: "Requested {requested} items, but only {actual} match current filters. Try disabling 'Preview only' or adjusting format filters for more results.",
```

---

### Task 8: Verify and commit

- [ ] **Step 1: Run the dev server and verify**

```bash
cd web && npm start
```

Expected: App starts without errors on port 3000.

- [ ] **Step 2: Manual smoke test — drag select from sidebar**

1. Open browser to `http://localhost:3000`
2. Perform a search to get results
3. Start dragging from the left sidebar empty space toward results
4. Expected: Yellow selection rectangle appears, cards are selected

- [ ] **Step 3: Manual smoke test — oversampling**

1. Open settings panel, set limit to 50
2. Ensure "仅含预览" is ON (default)
3. Perform a search
4. Check the "共 X 个资产" count — should be close to 50 (not 30-40 as before)
5. If fewer than 50, an info icon should appear with tooltip

- [ ] **Step 4: Commit all changes**

```bash
git add web/src/hooks/useDragSelect.js web/src/HybridSearchResults.jsx web/src/components/VirtualizedHybridSearchResults.jsx web/src/components/VirtualizedResults.jsx web/src/utils/oversample.js web/src/HybridDeepSearchUI.jsx web/src/components/ResultsTitleBar.jsx web/src/components/ResultsTitleBar.css web/src/components/FabToolbar.jsx web/src/i18n/zh.js web/src/i18n/en.js web/src/index.js
git commit -m "feat: extend drag-select to page-level + add search oversampling with shortage hint"
```

---

## Round 2 Patch (calvingu 2026-05-13 18:30)

第一轮（opus4.6）实施后两个 bug 仍未修复，本节补充第二轮修复方案。详细根因与方案见 `docs/superpowers/specs/2026-05-13-drag-select-oversample-design.md` 的"第二轮修复"段。

**变更文件清单（Round 2）**：

| File | Change |
|------|--------|
| `web/src/hooks/useDragSelect.js` | 拆分 `isHardInteractive` / `isContainerInnerSkip` / `isNativeDragSource`；容器外起点不再被 `data-drag-select-skip` 整块屏蔽；`mousedown` 阶段对 IMG/A 起点 `preventDefault`；新增 `dragstart` capture 监听兜底原生拖拽。 |
| `web/src/HybridDeepSearchUI.jsx` | 主搜索（fetch 前）+ Similar search（fetch 前）追加位置无关 `requestBody.limit = getApiLimit(...)`；`useCallback` 依赖列表加 `showOnlyWithPreviews`；`[Oversample Debug]` 日志增加 `userLimit / factor / apiLimitFinal` 显式打印。 |

**保留不动**：`useExitMultiSelectOnEmptyClick.js`、`oversample.js`、shortage tooltip 相关 UI、index.js 顶部 bar 的 `data-drag-select-skip`（仅影响容器内起点判断）。

**Round 2 验证清单**：

- [ ] 顶部 bar 空白处 mousedown → 横向拖动 ≥ 20px → 出现选择矩形
- [ ] 左侧 sidebar 空白处 / treeitem 上 mousedown → 横向拖动 ≥ 20px → 出现选择矩形
- [ ] 顶部 logo 上按下并拖动 → **没有**浏览器原生拖拽虚影
- [ ] 单击空白处 → SelectionModeBar 退出（无误激活框选）
- [ ] 卡片内拖拽 → paint 模式正常（add/remove）
- [ ] 控制台 `[Oversample Debug]` 显示 `apiLimitFinal: 52` 且 `hits.length` 接近 52

---

## Round 3 Patch (calvingu 2026-05-14 09:30)

Round 2 实施后两个现象仍未消除：(1) 残留矩形（sidebar 出现跟随鼠标的黄色框，需"再单击"才退出）；(2) 结果数 50→49（`limit=100` 请求 → `hits.length=49`，`data.total=600`，用户已确认 dedup 开关「关」）。

详细根因与方案见 `docs/superpowers/specs/2026-05-13-drag-select-oversample-design.md` 的「第三轮诊断」段。

### 关键决策（取决于用户的实测反馈）

经过对 Round 2 修复的代码再读 + `docs/DeepSearchSearchRequestV2.md` / `docs/SearchResponse.md` 调研：
- 原"e.buttons 卫生检查 + native drag 阻断 mouseup"假设 — **代码层无证据**，已撤销
- 原"50→49 是 uasset+fbx 总匹配数恰好 49"假设 — **被 `data.total=600` 推翻**，已撤销
- 原"自动续接拼满 userLimit"方案 — **V2 API 无 offset/cursor 字段**（确认完整字段表），技术上做不到

→ Round 3 采取「实质修复 + 临时 trace 日志」分流策略。

### 变更文件清单（Round 3）

| File | Change |
|------|--------|
| `web/src/HybridDeepSearchUI.jsx` | (1) `clientOnlyFields` 移除 `file_extension_include` 和 `file_extension_exclude` → 用户筛选真正发后端；(2) 浏览模式默认 `'uasset,fbx'` 改为「用户未设时才生效」；(3) `[Oversample Debug]` 新增打印 `dedup` 状态、requestBody 实发的 ext 字段、`data.search_metadata`、`hits[0..2]` hash 抽样、异常告警 |
| `web/src/hooks/useDragSelect.js` | 新增 `[DragSelect Trace]` 临时日志：DOWN outer / ACTIVATE / UP / DRAGSTART / DRAGEND 各一行，附 `describeEl()` 元素描述 helper |

**保留不动**：所有 Round 2 改动；`useExitMultiSelectOnEmptyClick`；`oversample.js`；shortage tooltip。

### Round 3 验证清单

**[修复 1：扩展名筛选 必须通过]**
- [ ] 重置筛选后勾选 `.png/.jpg` → 应能搜出 png/jpg 资产，不再 0 条
- [ ] 浏览模式（空 query）默认不勾选任何 ext → 仍展示 uasset/fbx 主资产
- [ ] `[Oversample Debug]` 中 `requestBody.file_extension_include` 字段有值（不再 `(未发)`）

**[trace 日志：复现后贴日志]**
- [ ] 复现"鼠标跟随矩形"现象后，复制全部 `[DragSelect Trace]` 日志：
  - 是否有 DOWN outer 但没有对应 UP？
  - 是否出现 DRAGSTART / DRAGEND？
  - 最后一条 UP 时 `target` 落在哪？
  - 中间是否 ACTIVATE 后没 UP？
- [ ] limit=50 复现 49 现象后，复制完整 `[Oversample Debug]` 日志：
  - `data.search_metadata` 内容（关键）
  - `hits[0..2]` 三条 `hash_value` 是否相同
  - 是否出现 ⚠️ 红字告警

### 不做的事

- 自动续接（V2 API 架构上不支持）
- 残留矩形「症状性补丁」（在根因未定位前不加防御性卫生检查，避免污染日志/掩盖真因）
- 重构 hook 架构

---

## Round 4 Patch (calvingu 2026-05-14 09:50) — 真因均已定位

Round 3 加了 trace 日志，用户复现后**两个真因全部浮出水面**：

### 残留矩形真因（trace 日志 100% 确认）

时间线：
```
DOWN outer  buttons:1  (147,513)    ← 第二次按下 sidebar
ACTIVATE    buttons:0  dist:26      ← ⚠️ 鼠标已松开，但 outerPending 残留导致激活
                                     （第二次的 mouseup 事件在日志里完全缺失）
```

**真因**：mouseup 偶尔丢失（最可能因 React 重渲染过程中 listener 重装空窗期吞了事件）。修法选 D（A+C）。

### 50→49 真因（多次请求实测确认）

| 测试 | apiLimit | hits | total | hits/limit |
|------|----------|------|-------|------------|
| limit=50, exclude 含 jpg/png | 100 | 49 | 600 | 0.490 |
| limit=500, exclude 含 jpg | 940 | 533 | 5442 | 0.567 |
| limit=500, exclude 不含 jpg | 902 | 457 | 5412 | 0.507 |

**真因**：后端浏览模式下**实际只返回请求量的 ~50%**（OpenSearch hybrid query 内部 collapse / 评分截断 / 或别的固有行为，前端无法干预）。

伴生问题：用户「**减少 exclude → 结果反而更少**」是因为旧 oversample factor 随 exclude 项数减小而减小（`1.5 × (1 + extCount × 0.05)`），叠加后端 50% 召回率，结果就更少了。

### Round 4 修复方案

**修复 1（残留矩形 — D = A+C）**：`web/src/hooks/useDragSelect.js`
- `handleMouseMove` 入口：`e.buttons === 0 && (outerPending || isActive)` 时强制重置 + 早返回 + 打 `[Trace] FORCE RESET` 日志
- `useEffect` 新增四类异常路径监听 + 共用 `safetyReset(reason)`：
  - `pointercancel` capture（系统级取消）
  - `window.blur`（切窗 / Alt+Tab）
  - `document.mouseleave`（鼠标拖出窗口）
  - `document.visibilitychange === 'hidden'`（标签页切走）

**修复 2（结果数 — Q1=B + Q2=「修反直觉」）**：`web/src/utils/oversample.js`
- 新增常量 `BACKEND_RECALL_COMPENSATION = 2.0`（基于实测后端给 50%）
- 公式重写为 `factor = BACKEND_RECALL_COMPENSATION × clientLoss`，**保底 2.0**
- 上限 3.0 不变（避免请求过大）
- 客户端损耗（thumbnail / ext exclude）保留原系数，但作为「叠加」而非「主导」

新 factor 速查表：

| 场景 | 旧 factor | 新 factor |
|------|-----------|-----------|
| 无任何过滤 | 1.0 | 2.0 |
| preview only | 1.5 | 3.0 (capped) |
| preview + 4 exts (1.2×) | 1.8 | 3.0 (capped) |
| preview + 8 exts (1.4×) | 2.1→上限旧 2.0 | 3.0 (capped) |

**修复 3（诊断日志增强）**：`web/src/HybridDeepSearchUI.jsx`
- factor 保留 3 位小数
- 新增打印 `apiLimit 是 userLimit 的 X.XX×`、`后端召回率 N.N%`
- 异常告警阈值改：当 `hits.length < userLimit && total > userLimit*2` 时告 `⚠️ [Round4 Shortage]`（之前是 `hits<limit*0.7` 几乎每次都触发）

### Round 4 验证清单

**[残留矩形 — 必须消失]**
- [ ] 第一次拖完后，立即点击 sidebar 多次 / 移动鼠标 → 不再出现跟随鼠标的黄色矩形
- [ ] 切窗（Alt+Tab）后回来 → 状态不残留
- [ ] 控制台偶尔会出现 `[DragSelect Trace] FORCE RESET` 或 `SAFETY RESET (...)` 日志属正常

**[结果数 — 必须满足]**
- [ ] limit=50 → visibleResults 应该等于 50（不再 49）
- [ ] limit=500 → visibleResults 应该等于 500（不再 456 / 532）
- [ ] 「减少 exclude 项 → 结果反而更少」反直觉应该消失（factor 保底 2.0，不再随 exclude 项数大幅波动）
- [ ] 控制台 `[Oversample Debug]` 应显示 `apiLimit 是 userLimit 的 2.x ~ 3.0×`、`后端召回率 ~50%`、不再频繁出现 ⚠️ 告警

### 不做的事（Round 4）

- 不动 useDragSelect 的 mouseup 丢失根本原因（React listener 重装空窗）— 用 e.buttons + 多重兜底已能完全治标，没必要重构 hook
- 不再尝试自动续接 / 修改后端 API
- 暂留 `[DragSelect Trace]` 临时日志（生产前删除）；`[Oversample Debug]` 长期保留


