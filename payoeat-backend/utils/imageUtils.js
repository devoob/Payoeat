import sharp from 'sharp';

/**
 * Resize image from base64 string while maintaining quality
 * @param {string} base64Image - Base64 encoded image
 * @param {number} maxWidth - Maximum width in pixels (default: 1024)
 * @param {number} maxHeight - Maximum height in pixels (default: 1024)
 * @param {number} quality - JPEG quality 1-100 (default: 85)
 * @returns {Promise<string>} - Resized base64 image
 */
export const resizeBase64Image = async (base64Image, maxWidth = 1024, maxHeight = 1024, quality = 85) => {
  try {
    // Remove the data URL prefix if present
    const base64Data = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // Convert base64 to buffer
    const inputBuffer = Buffer.from(base64Data, 'base64');
    
    // Get image metadata to check current dimensions
    const metadata = await sharp(inputBuffer).metadata();
    
    // Only resize if image is larger than max dimensions
    if (metadata.width <= maxWidth && metadata.height <= maxHeight) {
      console.log(`Image already within bounds: ${metadata.width}x${metadata.height}`);
      return base64Image;
    }
    
    console.log(`Resizing image from ${metadata.width}x${metadata.height} to max ${maxWidth}x${maxHeight}`);
    
    // Resize image while maintaining aspect ratio
    const resizedBuffer = await sharp(inputBuffer)
      .resize(maxWidth, maxHeight, {
        fit: 'inside', // Maintain aspect ratio
        withoutEnlargement: true // Don't enlarge smaller images
      })
      .jpeg({ 
        quality: quality,
        progressive: true,
        mozjpeg: true // Better compression
      })
      .toBuffer();
    
    // Convert back to base64
    const resizedBase64 = resizedBuffer.toString('base64');
    
    // Calculate compression ratio
    const originalSize = inputBuffer.length;
    const newSize = resizedBuffer.length;
    const compressionRatio = ((originalSize - newSize) / originalSize * 100).toFixed(1);
    
    console.log(`Image compression: ${originalSize} -> ${newSize} bytes (${compressionRatio}% reduction)`);
    
    return resizedBase64;
    
  } catch (error) {
    console.error('Error resizing image:', error);
    throw new Error('Failed to resize image');
  }
};

/**
 * Get optimized image dimensions for OpenAI Vision API
 * Balances quality with token cost
 */
export const getOptimizedDimensions = (useCase = 'food-analysis') => {
  const presets = {
    'food-analysis': { width: 768, height: 768, quality: 80 },
    'detailed-analysis': { width: 1024, height: 1024, quality: 85 },
    'quick-analysis': { width: 512, height: 512, quality: 75 },
  };
  
  return presets[useCase] || presets['food-analysis'];
};

/**
 * Estimate token usage based on image dimensions
 * OpenAI charges ~765 tokens per 512x512 tile
 */
export const estimateImageTokens = (width, height) => {
  const tilesX = Math.ceil(width / 512);
  const tilesY = Math.ceil(height / 512);
  const totalTiles = tilesX * tilesY;
  return totalTiles * 765; // Base tokens per tile
};