/**
 * Static path tree snapshot — fallback when no live data is available.
 *
 * 数据来源（2026-05-12 实拍 + 增量合并）：
 * - 通过 Playwright + DevTools 在 https://ov.qq.com/omni/web3/nucleus://ov.qq.com:443/
 *   的真实登录态下，从 React fiber 直接读出每个 TreeItem 的 props.path 字段
 * - 由 scripts/nucleus-tree-collector.console.js 增量采集，
 *   再由 scripts/build-static-path-tree.mjs 合并写回
 * - 共 217 个真实路径节点
 * - 后续通过 useNucleusTree hook 在用户登录后实时拉取 listing，
 *   动态合并搜索结果命中数（usePathSuggestions）
 *
 * 节点格式：
 *   {
 *     name: 'Projects',
 *     path: '/Projects',
 *     count: 0,
 *     children: null | TreeNode[],
 *     origin?: 'static'|'live',
 *   }
 */

const STATIC_PATH_TREE = [
  {
    name: "NVIDIA",
    path: "/NVIDIA",
    count: 0,
    origin: "static",
    children: [
    {
      name: "Assets",
      path: "/NVIDIA/Assets",
      count: 0,
      origin: "static",
      children: [
      {
        name: "AnimGraph",
        path: "/NVIDIA/Assets/AnimGraph",
        count: 0,
        origin: "static",
        children: [
        { name: "104.0", path: "/NVIDIA/Assets/AnimGraph/104.0", count: 0, children: null, origin: "static" },
        { name: "105.0", path: "/NVIDIA/Assets/AnimGraph/105.0", count: 0, children: null, origin: "static" },
        { name: "106.1", path: "/NVIDIA/Assets/AnimGraph/106.1", count: 0, children: null, origin: "static" },
        { name: "106.2", path: "/NVIDIA/Assets/AnimGraph/106.2", count: 0, children: null, origin: "static" },
        { name: "Animations", path: "/NVIDIA/Assets/AnimGraph/Animations", count: 0, children: null, origin: "static" },
        { name: "Characters", path: "/NVIDIA/Assets/AnimGraph/Characters", count: 0, children: null, origin: "static" },
        { name: "DefaultCharacters", path: "/NVIDIA/Assets/AnimGraph/DefaultCharacters", count: 0, children: null, origin: "static" },
        { name: "Samples", path: "/NVIDIA/Assets/AnimGraph/Samples", count: 0, children: null, origin: "static" },
        { name: "Worlds", path: "/NVIDIA/Assets/AnimGraph/Worlds", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "ArchVis",
        path: "/NVIDIA/Assets/ArchVis",
        count: 0,
        origin: "static",
        children: [
        { name: "Commercial", path: "/NVIDIA/Assets/ArchVis/Commercial", count: 0, children: null, origin: "static" },
        { name: "Industrial", path: "/NVIDIA/Assets/ArchVis/Industrial", count: 0, children: null, origin: "static" },
        { name: "Residential", path: "/NVIDIA/Assets/ArchVis/Residential", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "Audio2Face",
        path: "/NVIDIA/Assets/Audio2Face",
        count: 0,
        origin: "static",
        children: [
        { name: "Samples", path: "/NVIDIA/Assets/Audio2Face/Samples", count: 0, children: null, origin: "static" },
        { name: "Samples_2023.1", path: "/NVIDIA/Assets/Audio2Face/Samples_2023.1", count: 0, children: null, origin: "static" },
        { name: "Samples_2023.2", path: "/NVIDIA/Assets/Audio2Face/Samples_2023.2", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "Characters",
        path: "/NVIDIA/Assets/Characters",
        count: 0,
        origin: "static",
        children: [
        { name: "Reallusion", path: "/NVIDIA/Assets/Characters/Reallusion", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "Configurator",
        path: "/NVIDIA/Assets/Configurator",
        count: 0,
        origin: "static",
        children: [
        { name: "2023_1", path: "/NVIDIA/Assets/Configurator/2023_1", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "DigitalTwin",
        path: "/NVIDIA/Assets/DigitalTwin",
        count: 0,
        origin: "static",
        children: [
        { name: "Assets", path: "/NVIDIA/Assets/DigitalTwin/Assets", count: 0, children: null, origin: "static" },
        { name: "Materials", path: "/NVIDIA/Assets/DigitalTwin/Materials", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "Extensions",
        path: "/NVIDIA/Assets/Extensions",
        count: 0,
        origin: "static",
        children: [
        { name: "Samples", path: "/NVIDIA/Assets/Extensions/Samples", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "Isaac",
        path: "/NVIDIA/Assets/Isaac",
        count: 0,
        origin: "static",
        children: [
        { name: "4.0", path: "/NVIDIA/Assets/Isaac/4.0", count: 0, children: null, origin: "static" },
        { name: "4.1", path: "/NVIDIA/Assets/Isaac/4.1", count: 0, children: null, origin: "static" },
        { name: "4.2", path: "/NVIDIA/Assets/Isaac/4.2", count: 0, children: null, origin: "static" },
        { name: "4.5", path: "/NVIDIA/Assets/Isaac/4.5", count: 0, children: null, origin: "static" },
        { name: "5.0", path: "/NVIDIA/Assets/Isaac/5.0", count: 0, children: null, origin: "static" },
        { name: "5.1", path: "/NVIDIA/Assets/Isaac/5.1", count: 0, children: null, origin: "static" },
        { name: "6.0", path: "/NVIDIA/Assets/Isaac/6.0", count: 0, children: null, origin: "static" },
        { name: "2022.1", path: "/NVIDIA/Assets/Isaac/2022.1", count: 0, children: null, origin: "static" },
        { name: "2022.2.0", path: "/NVIDIA/Assets/Isaac/2022.2.0", count: 0, children: null, origin: "static" },
        { name: "2022.2.1", path: "/NVIDIA/Assets/Isaac/2022.2.1", count: 0, children: null, origin: "static" },
        { name: "2023.1.0", path: "/NVIDIA/Assets/Isaac/2023.1.0", count: 0, children: null, origin: "static" },
        { name: "2023.1.1", path: "/NVIDIA/Assets/Isaac/2023.1.1", count: 0, children: null, origin: "static" },
        { name: "Demos", path: "/NVIDIA/Assets/Isaac/Demos", count: 0, children: null, origin: "static" },
        { name: "Documentation", path: "/NVIDIA/Assets/Isaac/Documentation", count: 0, children: null, origin: "static" },
        { name: "Downloads", path: "/NVIDIA/Assets/Isaac/Downloads", count: 0, children: null, origin: "static" },
        { name: "Healthcare", path: "/NVIDIA/Assets/Isaac/Healthcare", count: 0, children: null, origin: "static" },
        { name: "OSS", path: "/NVIDIA/Assets/Isaac/OSS", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "Machinima",
        path: "/NVIDIA/Assets/Machinima",
        count: 0,
        origin: "static",
        children: [
        { name: "BannerlordII", path: "/NVIDIA/Assets/Machinima/BannerlordII", count: 0, children: null, origin: "static" },
        { name: "Mechwarrior5", path: "/NVIDIA/Assets/Machinima/Mechwarrior5", count: 0, children: null, origin: "static" },
        { name: "Mineways", path: "/NVIDIA/Assets/Machinima/Mineways", count: 0, children: null, origin: "static" },
        { name: "NVIDIA_Sol", path: "/NVIDIA/Assets/Machinima/NVIDIA_Sol", count: 0, children: null, origin: "static" },
        { name: "PostScriptum", path: "/NVIDIA/Assets/Machinima/PostScriptum", count: 0, children: null, origin: "static" },
        { name: "ShadowWarrior3", path: "/NVIDIA/Assets/Machinima/ShadowWarrior3", count: 0, children: null, origin: "static" },
        { name: "Squad", path: "/NVIDIA/Assets/Machinima/Squad", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "OmniGraph",
        path: "/NVIDIA/Assets/OmniGraph",
        count: 0,
        origin: "static",
        children: [
        { name: "Samples", path: "/NVIDIA/Assets/OmniGraph/Samples", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "Particles",
        path: "/NVIDIA/Assets/Particles",
        count: 0,
        origin: "static",
        children: [
        { name: "104", path: "/NVIDIA/Assets/Particles/104", count: 0, children: null, origin: "static" },
        { name: "105", path: "/NVIDIA/Assets/Particles/105", count: 0, children: null, origin: "static" },
        { name: "materials", path: "/NVIDIA/Assets/Particles/materials", count: 0, children: null, origin: "static" },
        { name: "meshes", path: "/NVIDIA/Assets/Particles/meshes", count: 0, children: null, origin: "static" },
        { name: "production_samples", path: "/NVIDIA/Assets/Particles/production_samples", count: 0, children: null, origin: "static" },
        { name: "templates", path: "/NVIDIA/Assets/Particles/templates", count: 0, children: null, origin: "static" },
        { name: "textures", path: "/NVIDIA/Assets/Particles/textures", count: 0, children: null, origin: "static" },
        { name: "tutorials", path: "/NVIDIA/Assets/Particles/tutorials", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "Scenes",
        path: "/NVIDIA/Assets/Scenes",
        count: 0,
        origin: "static",
        children: [
        { name: "Templates", path: "/NVIDIA/Assets/Scenes/Templates", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "simready_content",
        path: "/NVIDIA/Assets/simready_content",
        count: 0,
        origin: "static",
        children: [
        { name: "common_assets", path: "/NVIDIA/Assets/simready_content/common_assets", count: 0, children: null, origin: "static" },
        { name: "common_tools", path: "/NVIDIA/Assets/simready_content/common_tools", count: 0, children: null, origin: "static" },
        { name: "materials", path: "/NVIDIA/Assets/simready_content/materials", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "Skies",
        path: "/NVIDIA/Assets/Skies",
        count: 0,
        origin: "static",
        children: [
        { name: "2022_1", path: "/NVIDIA/Assets/Skies/2022_1", count: 0, children: null, origin: "static" },
        { name: "Clear", path: "/NVIDIA/Assets/Skies/Clear", count: 0, children: null, origin: "static" },
        { name: "Cloudy", path: "/NVIDIA/Assets/Skies/Cloudy", count: 0, children: null, origin: "static" },
        { name: "Dynamic", path: "/NVIDIA/Assets/Skies/Dynamic", count: 0, children: null, origin: "static" },
        { name: "Evening", path: "/NVIDIA/Assets/Skies/Evening", count: 0, children: null, origin: "static" },
        { name: "Indoor", path: "/NVIDIA/Assets/Skies/Indoor", count: 0, children: null, origin: "static" },
        { name: "Night", path: "/NVIDIA/Assets/Skies/Night", count: 0, children: null, origin: "static" },
        { name: "Sky_Elements", path: "/NVIDIA/Assets/Skies/Sky_Elements", count: 0, children: null, origin: "static" },
        { name: "Storm", path: "/NVIDIA/Assets/Skies/Storm", count: 0, children: null, origin: "static" },
        { name: "Studio", path: "/NVIDIA/Assets/Skies/Studio", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "Terrain",
        path: "/NVIDIA/Assets/Terrain",
        count: 0,
        origin: "static",
        children: [
        { name: "105", path: "/NVIDIA/Assets/Terrain/105", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "Vegetation",
        path: "/NVIDIA/Assets/Vegetation",
        count: 0,
        origin: "static",
        children: [
        { name: "Debris", path: "/NVIDIA/Assets/Vegetation/Debris", count: 0, children: null, origin: "static" },
        { name: "Leaves", path: "/NVIDIA/Assets/Vegetation/Leaves", count: 0, children: null, origin: "static" },
        { name: "Plant_Tropical", path: "/NVIDIA/Assets/Vegetation/Plant_Tropical", count: 0, children: null, origin: "static" },
        { name: "Rocks", path: "/NVIDIA/Assets/Vegetation/Rocks", count: 0, children: null, origin: "static" },
        { name: "Shrub", path: "/NVIDIA/Assets/Vegetation/Shrub", count: 0, children: null, origin: "static" },
        { name: "Trees", path: "/NVIDIA/Assets/Vegetation/Trees", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "XR",
        path: "/NVIDIA/Assets/XR",
        count: 0,
        origin: "static",
        children: [
        { name: "Stages", path: "/NVIDIA/Assets/XR/Stages", count: 0, children: null, origin: "static" },
        { name: "Templates", path: "/NVIDIA/Assets/XR/Templates", count: 0, children: null, origin: "static" }
      ],
      }
    ],
    },
    {
      name: "Demos",
      path: "/NVIDIA/Demos",
      count: 0,
      origin: "static",
      children: [
      { name: "AEC", path: "/NVIDIA/Demos/AEC", count: 0, children: null, origin: "static" },
      { name: "Cloud_Maker", path: "/NVIDIA/Demos/Cloud_Maker", count: 0, children: null, origin: "static" },
      { name: "Connect", path: "/NVIDIA/Demos/Connect", count: 0, children: null, origin: "static" },
      { name: "MFG", path: "/NVIDIA/Demos/MFG", count: 0, children: null, origin: "static" },
      { name: "WarehousePhysics", path: "/NVIDIA/Demos/WarehousePhysics", count: 0, children: null, origin: "static" }
    ],
    },
    {
      name: "Environments",
      path: "/NVIDIA/Environments",
      count: 0,
      origin: "static",
      children: [
      { name: "2023_1", path: "/NVIDIA/Environments/2023_1", count: 0, children: null, origin: "static" },
      { name: "2024_1", path: "/NVIDIA/Environments/2024_1", count: 0, children: null, origin: "static" }
    ],
    },
    {
      name: "Materials",
      path: "/NVIDIA/Materials",
      count: 0,
      origin: "static",
      children: [
      { name: "2023_1", path: "/NVIDIA/Materials/2023_1", count: 0, children: null, origin: "static" },
      { name: "2023_2_1", path: "/NVIDIA/Materials/2023_2_1", count: 0, children: null, origin: "static" },
      { name: "Base", path: "/NVIDIA/Materials/Base", count: 0, children: null, origin: "static" },
      { name: "OmniSurface", path: "/NVIDIA/Materials/OmniSurface", count: 0, children: null, origin: "static" },
      { name: "OmniVolumes", path: "/NVIDIA/Materials/OmniVolumes", count: 0, children: null, origin: "static" },
      { name: "vMaterials_2", path: "/NVIDIA/Materials/vMaterials_2", count: 0, children: null, origin: "static" }
    ],
    },
    {
      name: "RTXRemix",
      path: "/NVIDIA/RTXRemix",
      count: 0,
      origin: "static",
      children: [
      { name: "LightspeedAssets", path: "/NVIDIA/RTXRemix/LightspeedAssets", count: 0, children: null, origin: "static" },
      { name: "OVAssets", path: "/NVIDIA/RTXRemix/OVAssets", count: 0, children: null, origin: "static" }
    ],
    },
    {
      name: "Samples",
      path: "/NVIDIA/Samples",
      count: 0,
      origin: "static",
      children: [
      { name: "Astronaut", path: "/NVIDIA/Samples/Astronaut", count: 0, children: null, origin: "static" },
      { name: "EuclidVR", path: "/NVIDIA/Samples/EuclidVR", count: 0, children: null, origin: "static" },
      { name: "Examples", path: "/NVIDIA/Samples/Examples", count: 0, children: null, origin: "static" },
      { name: "Flight", path: "/NVIDIA/Samples/Flight", count: 0, children: null, origin: "static" },
      { name: "Marbles", path: "/NVIDIA/Samples/Marbles", count: 0, children: null, origin: "static" },
      { name: "OldAttic", path: "/NVIDIA/Samples/OldAttic", count: 0, children: null, origin: "static" },
      { name: "Robot-OVRTX", path: "/NVIDIA/Samples/Robot-OVRTX", count: 0, children: null, origin: "static" },
      { name: "Showcases", path: "/NVIDIA/Samples/Showcases", count: 0, children: null, origin: "static" }
    ],
    },
    {
      name: "SensorRTX",
      path: "/NVIDIA/SensorRTX",
      count: 0,
      origin: "static",
      children: [
      { name: "samples", path: "/NVIDIA/SensorRTX/samples", count: 0, children: null, origin: "static" },
      { name: "sensor-rtx-tutorial-content", path: "/NVIDIA/SensorRTX/sensor-rtx-tutorial-content", count: 0, children: null, origin: "static" },
      { name: "sensor-rtx-tutorial-content-0.1.37", path: "/NVIDIA/SensorRTX/sensor-rtx-tutorial-content-0.1.37", count: 0, children: null, origin: "static" },
      { name: "sensor-rtx-tutorial-content-0.2", path: "/NVIDIA/SensorRTX/sensor-rtx-tutorial-content-0.2", count: 0, children: null, origin: "static" },
      { name: "sensor-rtx-tutorial-content-1.0", path: "/NVIDIA/SensorRTX/sensor-rtx-tutorial-content-1.0", count: 0, children: null, origin: "static" }
    ],
    },
    {
      name: "Usd_Explorer",
      path: "/NVIDIA/Usd_Explorer",
      count: 0,
      origin: "static",
      children: [
      { name: "Samples", path: "/NVIDIA/Usd_Explorer/Samples", count: 0, children: null, origin: "static" }
    ],
    }
  ],
  },
  {
    name: ".system",
    path: "/.system",
    count: 0,
    origin: "static",
    children: [
    {
      name: "thumbnailer",
      path: "/.system/thumbnailer",
      count: 0,
      origin: "static",
      children: [
      { name: ".thumbs", path: "/.system/thumbnailer/.thumbs", count: 0, children: null, origin: "static" }
    ],
    }
  ],
  },
  {
    name: "Library",
    path: "/Library",
    count: 0,
    origin: "static",
    children: [
    {
      name: ".thumbs",
      path: "/Library/.thumbs",
      count: 0,
      origin: "static",
      children: [
      { name: "256x256", path: "/Library/.thumbs/256x256", count: 0, children: null, origin: "static" }
    ],
    },
    {
      name: "LightAI",
      path: "/Library/LightAI",
      count: 0,
      origin: "static",
      children: [
      { name: ".thumbs", path: "/Library/LightAI/.thumbs", count: 0, children: null, origin: "static" }
    ],
    },
    {
      name: "LightCraftShelf",
      path: "/Library/LightCraftShelf",
      count: 0,
      origin: "static",
      children: [
      {
        name: "OG2",
        path: "/Library/LightCraftShelf/OG2",
        count: 0,
        origin: "static",
        children: [
        { name: "LightCraftLayers", path: "/Library/LightCraftShelf/OG2/LightCraftLayers", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "SA",
        path: "/Library/LightCraftShelf/SA",
        count: 0,
        origin: "static",
        children: [
        { name: "LightCraftLayers", path: "/Library/LightCraftShelf/SA/LightCraftLayers", count: 0, children: null, origin: "static" }
      ],
      }
    ],
    },
    { name: "LightMarket", path: "/Library/LightMarket", count: 0, children: null, origin: "static" },
    { name: "test", path: "/Library/test", count: 0, children: null, origin: "static" },
    {
      name: "Test",
      path: "/Library/Test",
      count: 0,
      origin: "static",
      children: [
      { name: ".thumbs", path: "/Library/Test/.thumbs", count: 0, children: null, origin: "static" },
      {
        name: "Assets",
        path: "/Library/Test/Assets",
        count: 0,
        origin: "static",
        children: [
        { name: "Cathedral", path: "/Library/Test/Assets/Cathedral", count: 0, children: null, origin: "static" },
        { name: "OldOffice", path: "/Library/Test/Assets/OldOffice", count: 0, children: null, origin: "static" },
        { name: "RoadsideConstruction", path: "/Library/Test/Assets/RoadsideConstruction", count: 0, children: null, origin: "static" },
        { name: "RuralCabin", path: "/Library/Test/Assets/RuralCabin", count: 0, children: null, origin: "static" },
        { name: "test", path: "/Library/Test/Assets/test", count: 0, children: null, origin: "static" },
        { name: "UnderWater", path: "/Library/Test/Assets/UnderWater", count: 0, children: null, origin: "static" },
        { name: "UrbanTrash", path: "/Library/Test/Assets/UrbanTrash", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "Unreal",
        path: "/Library/Test/Unreal",
        count: 0,
        origin: "static",
        children: [
        { name: ".thumbs", path: "/Library/Test/Unreal/.thumbs", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "USD",
        path: "/Library/Test/USD",
        count: 0,
        origin: "static",
        children: [
        { name: ".thumbs", path: "/Library/Test/USD/.thumbs", count: 0, children: null, origin: "static" }
      ],
      }
    ],
    }
  ],
  },
  {
    name: "Projects",
    path: "/Projects",
    count: 0,
    origin: "static",
    children: [
    {
      name: "Default",
      path: "/Projects/Default",
      count: 0,
      origin: "static",
      children: [
      {
        name: "__BJsonServer",
        path: "/Projects/Default/__BJsonServer",
        count: 0,
        origin: "static",
        children: [
        { name: "Clients", path: "/Projects/Default/__BJsonServer/Clients", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "LightCraftNetwork_EUBP_RoadTool_Cloud_C",
        path: "/Projects/Default/LightCraftNetwork_EUBP_RoadTool_Cloud_C",
        count: 0,
        origin: "static",
        children: [
        { name: "PCG", path: "/Projects/Default/LightCraftNetwork_EUBP_RoadTool_Cloud_C/PCG", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "LightCraftNetwork_SC_LightCraft_CityRoad_Cloud_C",
        path: "/Projects/Default/LightCraftNetwork_SC_LightCraft_CityRoad_Cloud_C",
        count: 0,
        origin: "static",
        children: [
        { name: "PCG", path: "/Projects/Default/LightCraftNetwork_SC_LightCraft_CityRoad_Cloud_C/PCG", count: 0, children: null, origin: "static" },
        { name: "Temp", path: "/Projects/Default/LightCraftNetwork_SC_LightCraft_CityRoad_Cloud_C/Temp", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "LightCraftShelf",
        path: "/Projects/Default/LightCraftShelf",
        count: 0,
        origin: "static",
        children: [
        { name: "DebugLayers", path: "/Projects/Default/LightCraftShelf/DebugLayers", count: 0, children: null, origin: "static" },
        { name: "LightCraftLayers", path: "/Projects/Default/LightCraftShelf/LightCraftLayers", count: 0, children: null, origin: "static" },
        {
          name: "OG2",
          path: "/Projects/Default/LightCraftShelf/OG2",
          count: 0,
          origin: "static",
          children: [
          { name: "LightCraftLayers", path: "/Projects/Default/LightCraftShelf/OG2/LightCraftLayers", count: 0, children: null, origin: "static" }
        ],
        },
        {
          name: "SA",
          path: "/Projects/Default/LightCraftShelf/SA",
          count: 0,
          origin: "static",
          children: [
          { name: "LightCraftLayers", path: "/Projects/Default/LightCraftShelf/SA/LightCraftLayers", count: 0, children: null, origin: "static" }
        ],
        }
      ],
      }
    ],
    },
    {
      name: "OG",
      path: "/Projects/OG",
      count: 0,
      origin: "static",
      children: [
      {
        name: "LightCraftNetwork_EUBP_RoadTool_Cloud_C",
        path: "/Projects/OG/LightCraftNetwork_EUBP_RoadTool_Cloud_C",
        count: 0,
        origin: "static",
        children: [
        {
          name: "Developers",
          path: "/Projects/OG/LightCraftNetwork_EUBP_RoadTool_Cloud_C/Developers",
          count: 0,
          origin: "static",
          children: [
          {
            name: "mwilliams",
            path: "/Projects/OG/LightCraftNetwork_EUBP_RoadTool_Cloud_C/Developers/mwilliams",
            count: 0,
            origin: "static",
            children: [
            { name: "RoadSpline", path: "/Projects/OG/LightCraftNetwork_EUBP_RoadTool_Cloud_C/Developers/mwilliams/RoadSpline", count: 0, children: null, origin: "static" }
          ],
          }
        ],
        },
        {
          name: "PCG",
          path: "/Projects/OG/LightCraftNetwork_EUBP_RoadTool_Cloud_C/PCG",
          count: 0,
          origin: "static",
          children: [
          { name: "LightCraftCityRoad_Houdini", path: "/Projects/OG/LightCraftNetwork_EUBP_RoadTool_Cloud_C/PCG/LightCraftCityRoad_Houdini", count: 0, children: null, origin: "static" }
        ],
        }
      ],
      },
      {
        name: "LightCraftNetwork_SC_LightCraft_CityRoad_C",
        path: "/Projects/OG/LightCraftNetwork_SC_LightCraft_CityRoad_C",
        count: 0,
        origin: "static",
        children: [
        {
          name: "Developers",
          path: "/Projects/OG/LightCraftNetwork_SC_LightCraft_CityRoad_C/Developers",
          count: 0,
          origin: "static",
          children: [
          {
            name: "mdelanty",
            path: "/Projects/OG/LightCraftNetwork_SC_LightCraft_CityRoad_C/Developers/mdelanty",
            count: 0,
            origin: "static",
            children: [
            { name: "Mission", path: "/Projects/OG/LightCraftNetwork_SC_LightCraft_CityRoad_C/Developers/mdelanty/Mission", count: 0, children: null, origin: "static" }
          ],
          }
        ],
        },
        { name: "HBS", path: "/Projects/OG/LightCraftNetwork_SC_LightCraft_CityRoad_C/HBS", count: 0, children: null, origin: "static" },
        {
          name: "OG2",
          path: "/Projects/OG/LightCraftNetwork_SC_LightCraft_CityRoad_C/OG2",
          count: 0,
          origin: "static",
          children: [
          {
            name: "IMMOArts",
            path: "/Projects/OG/LightCraftNetwork_SC_LightCraft_CityRoad_C/OG2/IMMOArts",
            count: 0,
            origin: "static",
            children: [
            {
              name: "Maps",
              path: "/Projects/OG/LightCraftNetwork_SC_LightCraft_CityRoad_C/OG2/IMMOArts/Maps",
              count: 0,
              origin: "static",
              children: [
              { name: "World_Map", path: "/Projects/OG/LightCraftNetwork_SC_LightCraft_CityRoad_C/OG2/IMMOArts/Maps/World_Map", count: 0, children: null, origin: "static" }
            ],
            }
          ],
          }
        ],
        },
        {
          name: "PCG",
          path: "/Projects/OG/LightCraftNetwork_SC_LightCraft_CityRoad_C/PCG",
          count: 0,
          origin: "static",
          children: [
          { name: "LightCraftCityRoad_Houdini", path: "/Projects/OG/LightCraftNetwork_SC_LightCraft_CityRoad_C/PCG/LightCraftCityRoad_Houdini", count: 0, children: null, origin: "static" }
        ],
        },
        { name: "Temp", path: "/Projects/OG/LightCraftNetwork_SC_LightCraft_CityRoad_C/Temp", count: 0, children: null, origin: "static" }
      ],
      },
      {
        name: "Users",
        path: "/Projects/OG/Users",
        count: 0,
        origin: "static",
        children: [
        { name: "chuangma", path: "/Projects/OG/Users/chuangma", count: 0, children: null, origin: "static" },
        { name: "jamiehubbold_lucidgames", path: "/Projects/OG/Users/jamiehubbold_lucidgames", count: 0, children: null, origin: "static" },
        { name: "jayeyang", path: "/Projects/OG/Users/jayeyang", count: 0, children: null, origin: "static" },
        { name: "letheliu", path: "/Projects/OG/Users/letheliu", count: 0, children: null, origin: "static" },
        { name: "lloydlu", path: "/Projects/OG/Users/lloydlu", count: 0, children: null, origin: "static" },
        { name: "lorenzohe", path: "/Projects/OG/Users/lorenzohe", count: 0, children: null, origin: "static" },
        { name: "matthewjonathondelanty_lucidgames", path: "/Projects/OG/Users/matthewjonathondelanty_lucidgames", count: 0, children: null, origin: "static" },
        { name: "matthewwilliams_lucidgames", path: "/Projects/OG/Users/matthewwilliams_lucidgames", count: 0, children: null, origin: "static" },
        { name: "mikemyin", path: "/Projects/OG/Users/mikemyin", count: 0, children: null, origin: "static" },
        { name: "roycezheng", path: "/Projects/OG/Users/roycezheng", count: 0, children: null, origin: "static" },
        { name: "shaotang", path: "/Projects/OG/Users/shaotang", count: 0, children: null, origin: "static" },
        { name: "valon_lightpaw", path: "/Projects/OG/Users/valon_lightpaw", count: 0, children: null, origin: "static" },
        { name: "yuzhepan", path: "/Projects/OG/Users/yuzhepan", count: 0, children: null, origin: "static" }
      ],
      }
    ],
    }
  ],
  },
  {
    name: "Users",
    path: "/Users",
    count: 0,
    origin: "static",
    children: [
    { name: "bailetang", path: "/Users/bailetang", count: 0, children: null, origin: "static" },
    { name: "bybluewang", path: "/Users/bybluewang", count: 0, children: null, origin: "static" },
    { name: "gileszhang", path: "/Users/gileszhang", count: 0, children: null, origin: "static" },
    { name: "lloydlu", path: "/Users/lloydlu", count: 0, children: null, origin: "static" },
    { name: "maoyuwen", path: "/Users/maoyuwen", count: 0, children: null, origin: "static" },
    { name: "peipeizhou", path: "/Users/peipeizhou", count: 0, children: null, origin: "static" },
    { name: "yuongfeng", path: "/Users/yuongfeng", count: 0, children: null, origin: "static" }
  ],
  }
];

export { STATIC_PATH_TREE };

export function cloneStaticPathTree() {
  return JSON.parse(JSON.stringify(STATIC_PATH_TREE));
}

/**
 * 扁平化所有节点路径（用于搜索过滤）
 * - 不展开 children === null 的未加载节点（避免误把"未加载"当成"无子目录"）
 */
export function flattenPathNodes(tree = STATIC_PATH_TREE, acc = []) {
  for (const node of tree) {
    acc.push(node);
    if (Array.isArray(node.children) && node.children.length) {
      flattenPathNodes(node.children, acc);
    }
  }
  return acc;
}

/**
 * 真实根目录顺序（用于 UI 按官方顺序展示）
 * 顺序与 ov.qq.com 官方 Web Viewer 一致：NVIDIA / .system / Library / Projects / Users
 */
export const REAL_ROOT_ORDER = ['/NVIDIA', '/.system', '/Library', '/Projects', '/Users'];

export default STATIC_PATH_TREE;
