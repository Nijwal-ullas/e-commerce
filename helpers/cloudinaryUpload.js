import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadToCloudinary = (fileBuffer, folder = 'brands') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'auto', 
        transformation: [
          { width: 500, height: 500, crop: 'limit', quality: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload failed:', error);
          reject(new Error(`Upload failed: ${error.message}`));
        } else {
          console.log('Cloudinary upload successful:', result?.public_id);
          resolve(result);
        }
      }
    );
    
    uploadStream.on('error', (error) => {
      console.error('Stream error:', error);
      reject(new Error(`Stream error: ${error.message}`));
    });
    
    uploadStream.end(fileBuffer);
  });
};

export const uploadBufferToCloudinary = uploadToCloudinary;

export const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) {
      throw new Error('Public ID is required');
    }
    
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('Delete result:', result);
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
};

export const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  
  try {
    const matches = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.(?:jpg|jpeg|png|gif|webp)/i);
    return matches ? matches[1] : null;
  } catch (error) {
    console.error('Error extracting public ID from URL:', error);
    return null;
  }
};

export default cloudinary;