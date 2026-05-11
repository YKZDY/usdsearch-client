/**
 * Mock API Proxy for local UI preview / i18n testing.
 *
 * Create React App automatically picks up src/setupProxy.js
 * when running `npm start`. It uses Express-style middleware.
 *
 * This file intercepts all API calls that the frontend makes
 * and returns realistic mock data so you can preview the full UI
 * without a running backend server.
 *
 * *** To disable: rename or delete this file, then restart. ***
 */

const MOCK_ASSET_NAMES = [
  "warehouse_interior.usd",
  "robot_arm_v3.usda",
  "city_block_01.usdz",
  "vehicle_sedan_red.usd",
  "furniture_chair_modern.usda",
  "character_hero.usd",
  "landscape_mountain.usd",
  "industrial_pipe_set.usda",
  "space_station_module.usdz",
  "medieval_castle_gate.usd",
  "sci_fi_corridor.usd",
  "organic_tree_oak.usda",
  "mech_warrior_body.usd",
  "kitchen_appliance_set.usdz",
  "abstract_sculpture_01.usd",
];

const MOCK_PATHS = [
  "/Projects/Assets/Environment/",
  "/Projects/Assets/Characters/",
  "/Projects/Assets/Props/",
  "/Projects/Assets/Vehicles/",
  "/Projects/Assets/Materials/",
  "/Projects/Library/Shared/",
  "/Projects/Scenes/CityBlock/",
  "/Projects/Scenes/Interior/",
  "/Library/Materials/",
  "/Library/Textures/",
  "/NVIDIA/Samples/",
  "/NVIDIA/Assets/",
  "/Users/Public/",
  "/Archive/2024/Models/",
  "/temp/",
];

const MOCK_TAGS = [
  "interior", "exterior", "prop", "vehicle", "character",
  "environment", "industrial", "organic", "sci-fi", "medieval",
  "modern", "furniture", "architecture", "nature", "mechanical",
];

const MOCK_PLUGINS = [
  { name: "usd_explorer", description: "Explores USD scene hierarchy and extracts properties" },
  { name: "thumbnail_generator", description: "Generates preview thumbnails for USD assets" },
  { name: "dependency_analyzer", description: "Analyzes asset dependencies and references" },
  { name: "vision_metadata", description: "AI-generated visual metadata from thumbnails" },
  { name: "hash_indexer", description: "Computes and indexes file hashes for deduplication" },
];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomFloat(min, max, decimals = 3) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(startYear = 2023) {
  const start = new Date(startYear, 0, 1).getTime();
  const end = Date.now();
  return new Date(start + Math.random() * (end - start)).toISOString();
}

function generateMockHit(index) {
  const name = MOCK_ASSET_NAMES[index % MOCK_ASSET_NAMES.length];
  const path = randomChoice(MOCK_PATHS);
  const url = `omniverse://${path}${name}`;
  const score = randomFloat(0.3, 1.0);
  const rrfScore = randomFloat(0.1, 0.8);
  const tags = Array.from({ length: randomInt(2, 5) }, () => randomChoice(MOCK_TAGS));
  const uniqueTags = [...new Set(tags)];

  return {
    id: `mock-asset-${index}-${Date.now()}`,
    score,
    rrf_score: rrfScore,
    source: {
      base_key: url,
      url,
      name,
      type: name.split('.').pop(),
      size: randomInt(1024, 500 * 1024 * 1024),
      created: randomDate(2023),
      modified: randomDate(2024),
      etag: `"${Math.random().toString(36).substring(2, 15)}"`,
      hash: Math.random().toString(16).substring(2, 34),
      content_type: "application/usd",
      tags: uniqueTags,
    },
    metadata: {
      rrf_rank: index + 1,
      explanations: [
        {
          field: "text_search",
          search_type: "text",
          score: randomFloat(0.2, 0.9),
          matched_terms: [name.split('_')[0], name.split('.')[0].split('_').pop()],
          details: `Matched in file name and path with BM25 score ${randomFloat(5, 25)}`,
        },
        {
          field: "vector_search",
          search_type: "vector",
          score: randomFloat(0.3, 0.95),
          matched_terms: [],
          details: `Cosine similarity ${randomFloat(0.5, 0.98)} on embedding field`,
          is_vector: true,
        },
      ],
      vision_generated_metadata: {
        description: `A 3D ${name.replace(/[_\.]/g, ' ').replace(/usd[az]?/gi, '').trim()} asset with detailed geometry and PBR materials.`,
        tags: uniqueTags,
        category: randomChoice(["Environment", "Character", "Prop", "Vehicle", "Architecture"]),
      },
    },
    thumbnail_exists: Math.random() > 0.2,
  };
}

// --- Two fixed test asset entries for UI testing ---
const FIXED_TEST_ASSETS = [
  {
    id: "test-asset-cyberpunk-city-001",
    score: 0.982,
    rrf_score: 0.756,
    source: {
      base_key: "omniverse:///Projects/Assets/Environment/cyberpunk_city_block.usd",
      url: "omniverse:///Projects/Assets/Environment/cyberpunk_city_block.usd",
      name: "cyberpunk_city_block.usd",
      type: "usd",
      size: 157286400,        // ~150 MB
      created: "2025-01-15T09:30:00.000Z",
      modified: "2026-03-28T16:45:00.000Z",
      etag: "\"fixed-etag-cyberpunk-001\"",
      hash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      content_type: "application/usd",
      tags: ["cyberpunk", "city", "environment", "neon", "sci-fi"],
    },
    metadata: {
      rrf_rank: 1,
      explanations: [
        {
          field: "text_search",
          search_type: "text",
          score: 0.91,
          matched_terms: ["cyberpunk", "city"],
          details: "Matched in file name and path with BM25 score 22.3",
        },
        {
          field: "vector_search",
          search_type: "vector",
          score: 0.96,
          matched_terms: [],
          details: "Cosine similarity 0.97 on embedding field",
          is_vector: true,
        },
      ],
      vision_generated_metadata: {
        description: "A highly detailed cyberpunk city block with neon-lit skyscrapers, holographic billboards, flying vehicles, and rain-slicked streets. Features advanced PBR materials with emissive neon effects and volumetric fog.",
        tags: ["cyberpunk", "city", "environment", "neon", "sci-fi"],
        category: "Environment",
      },
    },
    thumbnail_exists: true,
  },
  {
    id: "test-asset-dragon-character-002",
    score: 0.945,
    rrf_score: 0.698,
    source: {
      base_key: "omniverse:///Projects/Assets/Characters/ancient_dragon_rigged.usda",
      url: "omniverse:///Projects/Assets/Characters/ancient_dragon_rigged.usda",
      name: "ancient_dragon_rigged.usda",
      type: "usda",
      size: 89456640,         // ~85 MB
      created: "2025-06-20T14:00:00.000Z",
      modified: "2026-02-10T11:22:00.000Z",
      etag: "\"fixed-etag-dragon-002\"",
      hash: "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3",
      content_type: "application/usd",
      tags: ["dragon", "character", "rigged", "fantasy", "creature"],
    },
    metadata: {
      rrf_rank: 2,
      explanations: [
        {
          field: "text_search",
          search_type: "text",
          score: 0.85,
          matched_terms: ["dragon", "rigged"],
          details: "Matched in file name and tags with BM25 score 19.7",
        },
        {
          field: "vector_search",
          search_type: "vector",
          score: 0.93,
          matched_terms: [],
          details: "Cosine similarity 0.95 on embedding field",
          is_vector: true,
        },
      ],
      vision_generated_metadata: {
        description: "A fully rigged ancient dragon character with detailed scales, wing membrane translucency, fire-breathing particle system, and skeletal animation rig with 120+ bones. Includes idle, fly, attack, and land animation clips.",
        tags: ["dragon", "character", "rigged", "fantasy", "creature"],
        category: "Character",
      },
    },
    thumbnail_exists: true,
  },
];

function generateSearchResponse(query, limit = 20) {
  const randomCount = Math.max(0, randomInt(Math.min(limit, 3), limit) - 2);
  const randomHits = Array.from({ length: randomCount }, (_, i) => generateMockHit(i));
  // Prepend fixed test assets, then random ones
  const hits = [...FIXED_TEST_ASSETS, ...randomHits];
  // Sort by score descending
  hits.sort((a, b) => b.score - a.score);
  // Re-assign rrf_rank after sorting
  hits.forEach((hit, i) => {
    hit.metadata.rrf_rank = i + 1;
  });
  return { hits, total: hits.length };
}

// --- Placeholder image generation (returns a small SVG as buffer) ---
function generatePlaceholderSvg(text) {
  const colors = ["#2D3748", "#1A365D", "#2C5282", "#2B6CB0", "#3182CE"];
  const bg = randomChoice(colors);
  const label = text ? text.substring(0, 12) : "Preview";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <rect width="256" height="256" fill="${bg}" rx="12"/>
    <text x="128" y="120" text-anchor="middle" fill="#A0AEC0" font-family="sans-serif" font-size="14">${label}</text>
    <text x="128" y="150" text-anchor="middle" fill="#718096" font-family="sans-serif" font-size="11">Mock Preview</text>
    <rect x="78" y="170" width="100" height="3" rx="1.5" fill="#4A5568"/>
  </svg>`;
  return Buffer.from(svg, 'utf-8');
}

// === LM CUSTOMIZATION: Placeholder image START ===
// 原因：英伟达原版仅用 SVG 占位图，但 Edge 浏览器对 data:image/svg+xml base64 渲染有兼容性问题，
// 且视觉上不像真实缩略图。改为：优先从 picsum.photos 拉取真实 JPG，失败时降级到 SVG。
// 合入英伟达新版本时：如上游修改了 generatePlaceholderSvg，保留上游版本即可；本块整体保留。

// --- Fetch a real placeholder image from picsum.photos (JPG, Edge/Chrome 兼容) ---
// 根据 url hash 生成一个稳定的 seed，保证相同 assetUrl 每次返回同一张图
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

async function fetchPlaceholderImage(assetUrl, res) {
  const https = require('https');
  const seed = hashString(assetUrl || 'default') % 1000;
  const imageUrl = `https://picsum.photos/seed/${seed}/256/256`;

  // 安全回退：如果 res 已经发送过 headers（pipe 已开始），就不能再 setHeader/send
  const sendFallbackSvg = () => {
    if (res.headersSent) { res.end(); return; }
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.send(generatePlaceholderSvg(assetUrl));
  };

  return new Promise((resolve) => {
    const request = https.get(imageUrl, (response) => {
      // picsum 会 302 重定向到实际 CDN
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redir = https.get(response.headers.location, (redirected) => {
          if (res.headersSent) { redirected.resume(); resolve(); return; }
          res.setHeader('Content-Type', redirected.headers['content-type'] || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          redirected.pipe(res);
          redirected.on('end', resolve);
          redirected.on('error', () => { sendFallbackSvg(); resolve(); });
        });
        redir.on('error', () => { sendFallbackSvg(); resolve(); });
      } else if (response.statusCode >= 200 && response.statusCode < 300) {
        res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        response.pipe(res);
        response.on('end', resolve);
        response.on('error', () => { sendFallbackSvg(); resolve(); });
      } else {
        response.resume(); // drain the response
        sendFallbackSvg();
        resolve();
      }
    });
    request.on('error', () => {
      sendFallbackSvg();
      resolve();
    });
    request.setTimeout(5000, () => {
      request.destroy();
      sendFallbackSvg();
      resolve();
    });
  });
}
// === LM CUSTOMIZATION: Placeholder image END ===

// ============================================================
// Express middleware
// ============================================================
module.exports = function (app) {
  // Parse JSON bodies - use the express bundled with react-scripts
  const express = require('express');
  app.use(express.json({ limit: '10mb' }));

  // ---------- Health / Info endpoints ----------

  app.get('/info/backend/storage', (_req, res) => {
    res.json({
      backends: {
        "s3://mock-lightmarket-bucket": {
          storage_backend_type: "s3",
          base_url: "s3://mock-lightmarket-bucket",
        },
      },
    });
  });

  app.get('/info/plugins', (_req, res) => {
    res.json({
      active: MOCK_PLUGINS,
      inactive: [
        { name: "experimental_nlp", description: "Natural language property extraction (beta)" },
      ],
    });
  });

  // ---------- Search endpoints ----------

  app.post('/search_hybrid', (req, res) => {
    const limit = req.body?.limit || 20;
    const query = req.body?.hybrid_text_query || "";
    console.log(`[Mock API] /search_hybrid  query="${query}"  limit=${limit}`);
    const response = generateSearchResponse(query, limit);
    res.json(response);
  });

  app.post('/search', (req, res) => {
    const limit = req.body?.limit || 20;
    const query = req.body?.query || req.body?.hybrid_text_query || "";
    console.log(`[Mock API] /search  query="${query}"`);
    res.json(generateSearchResponse(query, limit));
  });

  // ---------- Asset detail endpoints ----------

  app.get('/asset/dependencies', (req, res) => {
    const url = req.query.url || "unknown";
    res.json({
      dependencies: [
        `${url.replace(/[^/]+$/, '')}materials/default_material.usd`,
        `${url.replace(/[^/]+$/, '')}textures/base_color.png`,
        `${url.replace(/[^/]+$/, '')}textures/normal.png`,
      ],
      inverse_dependencies: [
        `${url.replace(/[^/]+$/, '')}scenes/main_scene.usd`,
      ],
    });
  });

  app.get('/asset/usd_properties', (req, res) => {
    res.json({
      properties: {
        "upAxis": "Y",
        "metersPerUnit": "0.01",
        "defaultPrim": "World",
        "doc": "Generated USD scene",
        "startTimeCode": "0",
        "endTimeCode": "240",
      },
    });
  });

  app.get('/asset/tags', (req, res) => {
    const tags = Array.from({ length: randomInt(3, 8) }, () => randomChoice(MOCK_TAGS));
    res.json({ tags: [...new Set(tags)] });
  });

  // Re-index
  app.post('/asset/reindex', (_req, res) => {
    res.json({ status: "ok", message: "Re-indexing queued" });
  });

  app.post('/asset/reindex/:pluginName', (req, res) => {
    res.json({ status: "ok", message: `Re-indexing queued for ${req.params.pluginName}` });
  });

  // Plugin statuses for an asset
  app.get('/asset/plugin_statuses', (_req, res) => {
    const statuses = {};
    MOCK_PLUGINS.forEach(p => {
      statuses[p.name] = {
        status: randomChoice(["indexed", "indexed", "indexed", "pending", "error"]),
        last_updated: randomDate(2024),
      };
    });
    res.json(statuses);
  });

  // ---------- Image / thumbnail endpoint ----------

  // === LM CUSTOMIZATION: Image routes START ===
  // 变更说明：
  // 1. 新增 /images（复数）路由 —— 前端 imageLoader.js 实际请求的是 /images，原版 mock 只写了 /image，图片全部 404。
  // 2. GET 使用 fetchPlaceholderImage（picsum 真实图片，Edge 兼容），POST 保留 SVG。
  // 合入英伟达新版本时：
  //   - 若上游仍只写 /image，把此处的 /images 一并保留
  //   - 若上游也修了 /images，对比 handler 实现，保留我们的 fetchPlaceholderImage 调用
  const imageHandler = async (req, res) => {
    const assetUrl = req.query.asset_url || req.query.url || "asset";
    try {
      await fetchPlaceholderImage(assetUrl, res);
    } catch (e) {
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.send(generatePlaceholderSvg(assetUrl.split('/').pop() || 'preview'));
    }
  };
  app.get('/image', imageHandler);
  app.get('/images', imageHandler);

  app.post('/image', (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.send(generatePlaceholderSvg("Upload Preview"));
  });
  app.post('/images', (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.send(generatePlaceholderSvg("Upload Preview"));
  });
  // === LM CUSTOMIZATION: Image routes END ===

  // ---------- Catch-all for unknown API routes ----------

  app.all('/api/*', (req, res) => {
    console.log(`[Mock API] Unhandled: ${req.method} ${req.url}`);
    res.status(200).json({ status: "ok", mock: true });
  });

  console.log('\n====================================');
  console.log('  🎭 Mock API Proxy is ACTIVE');
  console.log('  All backend calls return mock data.');
  console.log('  Delete src/setupProxy.js to disable.');
  console.log('====================================\n');
};
