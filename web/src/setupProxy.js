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
  "/Projects/Library/Shared/",
  "/Archive/2024/Models/",
  "/Projects/Scenes/Main/",
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

  app.get('/image', (req, res) => {
    const url = req.query.url || "asset";
    const name = url.split('/').pop() || "preview";
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(generatePlaceholderSvg(name));
  });

  app.post('/image', (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(generatePlaceholderSvg("Upload Preview"));
  });

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
