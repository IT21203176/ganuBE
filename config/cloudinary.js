const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper function to create storage for different folders
const createCloudinaryStorage = (folder) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: folder,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'],
      resource_type: 'auto', // Automatically detect resource type (image, pdf, etc.)
      transformation: [{ quality: 'auto' }] // Auto quality optimization
    }
  });
};

// Create upload middleware for different types
const createUploadMiddleware = (folder, maxSize = 20) => {
  const storage = createCloudinaryStorage(folder);
  
  const fileFilter = (req, file, cb) => {
    // Allow images and PDFs
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image and PDF files are allowed!'), false);
    }
  };
  
  return multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
      fileSize: maxSize * 1024 * 1024 // Convert MB to bytes
    }
  });
};

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: 'File too large. Maximum size is 20MB.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        message: 'Unexpected field or too many files.'
      });
    }
  } else if (error) {
    return res.status(400).json({
      message: error.message
    });
  }
  next(error);
};

// Helper function to delete file from Cloudinary
const deleteFromCloudinary = async (url) => {
  try {
    if (!url) return;
    
    // Extract public_id from Cloudinary URL
    // URL format: https://res.cloudinary.com/[cloud_name]/[resource_type]/upload/[version]/[public_id].[format]
    const urlParts = url.split('/');
    const uploadIndex = urlParts.indexOf('upload');
    
    if (uploadIndex === -1) return;
    
    // Get public_id (everything after upload/, excluding version if present)
    const publicIdWithExt = urlParts.slice(uploadIndex + 2).join('/');
    const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));
    
    // Determine resource type from URL
    const resourceType = url.includes('/image/') ? 'image' : 'raw';
    
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    console.log(`Deleted from Cloudinary: ${publicId}`);
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
  }
};

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

module.exports = {
  cloudinary,
  createUploadMiddleware,
  handleMulterError,
  deleteFromCloudinary,
  formatFileSize
};

