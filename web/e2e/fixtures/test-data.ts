/**
 * 固定测试数据 — 来自 setupProxy.mock.js 中的 2 个固定资产
 *
 * 这两个资产在 Mock 模式下 **始终** 出现在搜索结果的前 2 位，
 * 可以用于确定性断言，不会因随机数据导致测试 flaky。
 */

/** 固定资产 #1：赛博朋克城市（始终排第一） */
export const CYBERPUNK_ASSET = {
  id: 'test-asset-cyberpunk-city-001',
  name: 'cyberpunk_city_block.usd',
  url: 'omniverse:///Projects/Assets/Environment/cyberpunk_city_block.usd',
  tags: ['cyberpunk', 'city', 'environment', 'neon', 'sci-fi'],
  type: 'usd',
  category: 'Environment',
  score: 0.982,
  size: 157_286_400, // ~150 MB
};

/** 固定资产 #2：古龙角色（始终排第二） */
export const DRAGON_ASSET = {
  id: 'test-asset-dragon-character-002',
  name: 'ancient_dragon_rigged.usda',
  url: 'omniverse:///Projects/Assets/Characters/ancient_dragon_rigged.usda',
  tags: ['dragon', 'character', 'rigged', 'fantasy', 'creature'],
  type: 'usda',
  category: 'Character',
  score: 0.945,
  size: 89_456_640, // ~85 MB
};

/** Mock 模式下可用的标签列表 */
export const MOCK_TAGS = [
  'interior', 'exterior', 'prop', 'vehicle', 'character',
  'environment', 'industrial', 'organic', 'sci-fi', 'medieval',
  'modern', 'furniture', 'architecture', 'nature', 'mechanical',
];

/** Mock 模式下的插件列表 */
export const MOCK_PLUGINS = [
  'usd_explorer',
  'thumbnail_generator',
  'dependency_analyzer',
  'vision_metadata',
  'hash_indexer',
];
