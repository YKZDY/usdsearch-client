#!/usr/bin/env node
/**
 * snapshot-nucleus-tree.mjs
 *
 * 一次性快照脚本：通过 search_hybrid API 反推 Nucleus 顶层目录结构，
 * 写回 web/src/data/pathTree.js 的 STATIC_PATH_TREE。
 *
 * ─────────────────────────────────────────────────────────────
 * 为什么用 search 反推而不是 listing API？
 *   - 当前后端无 listing 接口、无 omni-client 引用、前端 @omniverse SDK
 *     也没暴露 browse 客户端（见 Batch-1 调查）
 *   - search_hybrid 是已有稳定接口，对空 query 返回的 hits 中
 *     hit.source.path 包含真实路径，可按 / 分段聚合出目录结构
 * ─────────────────────────────────────────────────────────────
 *
 * 使用方式（需要本地 dev server 已启动，或直接指向生产 API）：
 *
 *   # 默认走本地反代（npm start 后）
 *   node scripts/snapshot-nucleus-tree.mjs
 *
 *   # 指定 API host 与 auth
 *   API_BASE=https://ov.qq.com NUCLEUS_API_TOKEN=xxx node scripts/snapshot-nucleus-tree.mjs
 *
 *   # 只 dry-run，不写文件
 *   node scripts/snapshot-nucleus-tree.mjs --dry
 *
 * 输出：
 *   - 覆盖 web/src/data/pathTree.js 的 STATIC_PATH_TREE 数组
 *   - 控制台打印发现的根目录与每个根目录下的二级目录数
 *
 * 注意：
 *   - 脚本不修改 cloneStaticPathTree / flattenPathNodes / REAL_ROOT_ORDER 这些工具导出
 *   - 真实根目录顺序固定为 NVIDIA / .system / Library / Projects / Users，
 *     即使 search 命中里漏掉某根（如 .system 通常不被索引），也保留占位
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATH_TREE_FILE = resolve(__dirname, '../web/src/data/pathTree.js');

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const NUCLEUS_API_TOKEN = process.env.NUCLEUS_API_TOKEN || '';
const API_KEY = process.env.API_KEY || '';
const DRY_RUN = process.argv.includes('--dry');

const REAL_ROOT_ORDER = ['/NVIDIA', '/.system', '/Library', '/Projects', '/Users'];

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;
  else if (NUCLEUS_API_TOKEN) {
    const basic = Buffer.from(`$omni-api-token:${NUCLEUS_API_TOKEN}`).toString('base64');
    headers['Authorization'] = `Basic ${basic}`;
  }
  return headers;
}

async function fetchHits(prefix) {
  const body = {
    query: '',
    limit: 500,
    return_root_prims: false,
    return_predictions: false,
    return_images: false,
    return_metadata: true,
    return_usd_properties: false,
    return_usd_dimensions: false,
    return_tags: false,
    search_path: prefix || undefined,
  };
  // 仅当 prefix 非空时下传，避免后端拒绝空字符串
  if (!prefix) delete body.search_path;

  const res = await fetch(`${API_BASE}/search_hybrid`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`[snapshot] search_hybrid (prefix=${prefix || '/'}) failed: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return Array.isArray(data.hits) ? data.hits : (Array.isArray(data) ? data : []);
}

function aggregatePaths(hits) {
  const counts = new Map();
  for (const hit of hits) {
    const raw = hit?.source?.path || hit?.source?.base_key || hit?.source?.url || '';
    if (!raw) continue;
    let cleaned = String(raw).replace(/^[a-z]+:\/+/i, '/').replace(/\/+/g, '/');
    if (!cleaned.startsWith('/')) cleaned = '/' + cleaned;
    const lastSlash = cleaned.lastIndexOf('/');
    const tail = cleaned.slice(lastSlash + 1);
    if (tail.includes('.')) cleaned = cleaned.slice(0, lastSlash);
    if (!cleaned) continue;
    const segs = cleaned.split('/').filter(Boolean);
    let cur = '';
    for (const seg of segs) {
      cur += '/' + seg;
      counts.set(cur, (counts.get(cur) || 0) + 1);
    }
  }
  return counts;
}

function buildTreeFromCounts(counts) {
  // 按 REAL_ROOT_ORDER 顺序构建根节点
  const tree = REAL_ROOT_ORDER.map((rootPath) => ({
    name: rootPath.slice(1),
    path: rootPath,
    count: counts.get(rootPath) || 0,
    children: null, // 默认懒加载
    origin: 'static',
  }));

  // 把命中的二级目录挂到对应根下
  const rootByPath = new Map(tree.map((n) => [n.path, n]));
  for (const [path, count] of counts.entries()) {
    const segs = path.split('/').filter(Boolean);
    if (segs.length !== 2) continue; // 只处理二级
    const rootPath = '/' + segs[0];
    const root = rootByPath.get(rootPath);
    if (!root) continue;
    if (root.children === null) root.children = [];
    root.children.push({
      name: segs[1],
      path,
      count,
      children: null,
      origin: 'static',
    });
  }
  return tree;
}

function serializeTree(tree) {
  // 输出格式化的 JS 对象字面量（不用 JSON.stringify，以便保留 children: null 语义和注释）
  const fmt = (node, indent) => {
    const pad = ' '.repeat(indent);
    const lines = [`${pad}{`];
    lines.push(`${pad}  name: ${JSON.stringify(node.name)},`);
    lines.push(`${pad}  path: ${JSON.stringify(node.path)},`);
    lines.push(`${pad}  count: ${node.count || 0},`);
    if (Array.isArray(node.children) && node.children.length > 0) {
      lines.push(`${pad}  children: [`);
      for (const child of node.children) {
        lines.push(fmt(child, indent + 4) + ',');
      }
      lines.push(`${pad}  ],`);
    } else {
      lines.push(`${pad}  children: null,`);
    }
    lines.push(`${pad}  origin: 'static',`);
    lines.push(`${pad}}`);
    return lines.join('\n');
  };
  return '[\n' + tree.map((n) => fmt(n, 2)).join(',\n') + ',\n]';
}

async function main() {
  console.log(`[snapshot] Probing ${API_BASE}/search_hybrid …`);
  const hits = await fetchHits('');
  console.log(`[snapshot] received ${hits.length} hits`);
  const counts = aggregatePaths(hits);
  const tree = buildTreeFromCounts(counts);

  for (const node of tree) {
    const childCount = Array.isArray(node.children) ? node.children.length : 0;
    console.log(`  ${node.path.padEnd(12)} count=${node.count}  children=${childCount}`);
  }

  if (DRY_RUN) {
    console.log('\n[snapshot] DRY RUN — would write:\n');
    console.log(serializeTree(tree));
    return;
  }

  const source = await readFile(PATH_TREE_FILE, 'utf8');
  const newArrayLiteral = serializeTree(tree);
  // 匹配 const STATIC_PATH_TREE = [ ... ];（多行，DOTALL，最短匹配）
  const updated = source.replace(
    /const STATIC_PATH_TREE = \[[\s\S]*?\n\];/m,
    `const STATIC_PATH_TREE = ${newArrayLiteral};`
  );
  if (updated === source) {
    console.error('[snapshot] ERROR: failed to locate STATIC_PATH_TREE in pathTree.js');
    process.exit(1);
  }
  await writeFile(PATH_TREE_FILE, updated, 'utf8');
  console.log(`\n[snapshot] ✓ written to ${PATH_TREE_FILE}`);
}

main().catch((err) => {
  console.error('[snapshot] FATAL', err);
  process.exit(1);
});
