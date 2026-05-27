/**
 * 黑图检测工具模块
 * 
 * 用于检测预览图是否为纯黑/近黑（渲染失败或无效图片），
 * 以便在相似搜索等场景中自动跳过无效图片。
 * 
 * 检测策略：将图片绘制到离屏 canvas，采样像素计算平均亮度，
 * 阈值 < 10（0-255 范围）判定为"纯黑/无效"。
 */

// === LM CUSTOMIZATION: BlackImageDetector START ===
// 原因：USD 资产多张渲染图中部分为纯黑（渲染失败），需要自动检测以优化 UX
// 合入英伟达新版时：保留本文件（NVIDIA 原版无此功能，零冲突风险）

/**
 * 亮度阈值：平均亮度低于此值判定为黑图
 * 范围 0-255，10 表示几乎全黑
 */
const BLACK_IMAGE_THRESHOLD = 10;

/**
 * 采样网格大小：在图片上均匀采样 SAMPLE_SIZE x SAMPLE_SIZE 个像素点
 * 使用采样而非全像素扫描以提升性能
 */
const SAMPLE_SIZE = 16;

/**
 * 检测一张图片是否为"黑图"（纯黑/近黑无效图）
 * 
 * @param {string} imageDataUrl - 图片的 data URL（base64 编码）
 * @returns {Promise<boolean>} true 表示是黑图/无效图，false 表示有效图
 */
export const isBlackImage = (imageDataUrl) => {
  return new Promise((resolve) => {
    // 无效输入直接判定为黑图
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      resolve(true);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        // 创建离屏 canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // 使用较小的绘制尺寸以提升性能
        const drawSize = SAMPLE_SIZE * 4; // 64x64
        canvas.width = drawSize;
        canvas.height = drawSize;

        // 绘制图片到 canvas（缩放到 drawSize）
        ctx.drawImage(img, 0, 0, drawSize, drawSize);

        // 获取像素数据
        const imageData = ctx.getImageData(0, 0, drawSize, drawSize);
        const pixels = imageData.data; // RGBA 数组

        // 均匀采样计算平均亮度
        let totalBrightness = 0;
        let sampleCount = 0;
        const step = Math.floor(drawSize / SAMPLE_SIZE);

        for (let y = 0; y < drawSize; y += step) {
          for (let x = 0; x < drawSize; x += step) {
            const idx = (y * drawSize + x) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            // 使用感知亮度公式（ITU-R BT.601）
            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            totalBrightness += brightness;
            sampleCount++;
          }
        }

        const averageBrightness = sampleCount > 0 ? totalBrightness / sampleCount : 0;
        resolve(averageBrightness < BLACK_IMAGE_THRESHOLD);
      } catch (err) {
        // canvas 操作失败（如 CORS 问题），保守判定为非黑图
        console.warn('BlackImageDetector: canvas 操作失败', err);
        resolve(false);
      }
    };

    img.onerror = () => {
      // 图片加载失败，判定为黑图（无效图）
      resolve(true);
    };

    // 设置超时：2 秒内未完成则判定为非黑图（不阻塞 UI）
    const timeout = setTimeout(() => {
      resolve(false);
    }, 2000);

    img.onload = ((originalOnload) => {
      return function () {
        clearTimeout(timeout);
        originalOnload.call(this);
      };
    })(img.onload);

    img.onerror = ((originalOnerror) => {
      return function () {
        clearTimeout(timeout);
        originalOnerror.call(this);
      };
    })(img.onerror);

    img.src = imageDataUrl;
  });
};

/**
 * 从图片数组中找到第一张有效（非黑）图片的索引
 * 
 * @param {string[]} imageDataUrls - 图片 data URL 数组（按 offset 顺序）
 * @returns {Promise<number>} 第一张有效图片的索引，如果全部为黑图则返回 -1
 */
export const findFirstValidImageIndex = async (imageDataUrls) => {
  if (!imageDataUrls || imageDataUrls.length === 0) {
    return -1;
  }

  // 并行检测所有图片（性能优化：不逐个等待）
  const results = await Promise.all(
    imageDataUrls.map((url) => isBlackImage(url))
  );

  // 返回第一个非黑图的索引
  for (let i = 0; i < results.length; i++) {
    if (!results[i]) {
      return i;
    }
  }

  // 所有图片都是黑图
  return -1;
};

/**
 * 批量检测图片数组，返回每张图片的黑图状态
 * 
 * @param {string[]} imageDataUrls - 图片 data URL 数组
 * @returns {Promise<boolean[]>} 每张图片是否为黑图的布尔数组
 */
export const detectBlackImages = async (imageDataUrls) => {
  if (!imageDataUrls || imageDataUrls.length === 0) {
    return [];
  }

  return Promise.all(imageDataUrls.map((url) => isBlackImage(url)));
};

// === LM CUSTOMIZATION: BlackImageDetector END ===
