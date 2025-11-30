const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Detect if running on Vercel (ephemeral filesystem)
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

// Create Cloudinary storage for images
const createCloudinaryStorage = (folder) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: folder,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      resource_type: 'image',
      transformation: [{ quality: 'auto' }]
    }
  });
};

// Create Cloudinary storage for PDFs (raw type)
const createCloudinaryPdfStorage = (folder) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: folder,
      resource_type: 'raw',
      format: 'pdf',
      access_mode: 'public'
    }
  });
};

// Create disk storage for PDFs (local development/cPanel)
const createDiskStorage = (uploadDir) => {
  return multer.diskStorage({
    destination: function (req, file, cb) {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'blog-' + uniqueSuffix + path.extname(file.originalname));
    }
  });
};

// Upload PDF buffer to Cloudinary (for Vercel)
const uploadPdfToCloudinary = async (fileBuffer, folder, originalname) => {
  return new Promise((resolve, reject) => {
    const sanitizedName = originalname
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 100);
    
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'raw',
        public_id: `${sanitizedName}_${Date.now()}.pdf`,
        access_mode: 'public'
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

// Hybrid storage: Images → Cloudinary, PDFs → Cloudinary (Vercel) or Local (cPanel/local)
const createHybridStorage = (cloudinaryFolder, localUploadDir) => {
  const cloudinaryImageStorage = createCloudinaryStorage(cloudinaryFolder);
  const cloudinaryPdfStorage = isVercel ? createCloudinaryPdfStorage(cloudinaryFolder) : null;
  const diskPdfStorage = isVercel ? null : createDiskStorage(localUploadDir);

  return {
    _handleFile: function (req, file, cb) {
      const isPdf = file.mimetype === 'application/pdf';
      
      if (isPdf) {
        if (isVercel) {
          // On Vercel: Use memory storage, then upload to Cloudinary
          const memoryStorage = multer.memoryStorage();
          memoryStorage._handleFile(req, file, async (err, info) => {
            if (err) return cb(err);
            
            try {
              const result = await uploadPdfToCloudinary(
                info.buffer,
                cloudinaryFolder,
                file.originalname
              );
              
              // Return Cloudinary info in the format multer expects
              cb(null, {
                path: result.secure_url + '.pdf?fl_attachment=false',
                filename: result.public_id,
                size: file.size,
                mimetype: file.mimetype,
                originalname: file.originalname
              });
            } catch (uploadError) {
              cb(uploadError);
            }
          });
        } else {
          // Local/cPanel: Use disk storage
          diskPdfStorage._handleFile(req, file, cb);
        }
      } else {
        // Images always go to Cloudinary
        cloudinaryImageStorage._handleFile(req, file, cb);
      }
    },
    _removeFile: function (req, file, cb) {
      if (file.path && !file.path.includes('cloudinary.com') && !isVercel) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
      cb(null);
    }
  };
};

// Create upload middleware - hybrid approach
const createUploadMiddleware = (cloudinaryFolder, localUploadDir, maxSize = 20) => {
  const storage = createHybridStorage(cloudinaryFolder, localUploadDir);
  
  const fileFilter = (req, file, cb) => {
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
      fileSize: maxSize * 1024 * 1024
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

// Helper function to delete file (handles both Cloudinary and local files)
const deleteFile = async (url) => {
  try {
    if (!url) return;
    
    if (url.includes('cloudinary.com')) {
      await deleteFromCloudinary(url);
    } else if (url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted local file: ${filePath}`);
      }
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
};

// Helper function to delete file from Cloudinary
const deleteFromCloudinary = async (url) => {
  try {
    if (!url || !url.includes('cloudinary.com')) return;
    
    // Remove query parameters
    const cleanUrl = url.split('?')[0];
    
    const urlParts = cleanUrl.split('/');
    const uploadIndex = urlParts.indexOf('upload');
    
    if (uploadIndex === -1) return;
    
    // Determine resource type
    const isRaw = cleanUrl.includes('/raw/');
    const resourceType = isRaw ? 'raw' : 'image';
    
    // Extract public_id
    let publicId = urlParts.slice(uploadIndex + 2).join('/');
    
    // Remove file extension from public_id
    const lastDotIndex = publicId.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      publicId = publicId.substring(0, lastDotIndex);
    }
    
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    console.log(`Deleted from Cloudinary: ${publicId} (${resourceType})`);
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
  deleteFile,
  deleteFromCloudinary,
  formatFileSize,
  isVercel
};
