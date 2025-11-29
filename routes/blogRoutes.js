const express = require("express");
const router = express.Router();
const Blog = require("../models/Blog");
const { protect, requireRole } = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/blogs');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'blog-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allow both images and PDFs
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only image and PDF files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024 // Increase to 20MB for larger PDFs
  }
});

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

// Get all blogs (public) - only published blogs
router.get("/", async (req, res) => {
  try {
    const blogs = await Blog.find({ published: true }).sort({ createdAt: -1 });
    res.json(blogs);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching blogs" });
  }
});

// Get all blogs (admin only - including unpublished)
router.get("/admin/all", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.json(blogs);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching blogs" });
  }
});

// Get single blog (public) - only if published
router.get("/:id", async (req, res) => {
  try {
    const blog = await Blog.findOne({ 
      _id: req.params.id, 
      published: true 
    });
    if (!blog) return res.status(404).json({ message: "Blog not found" });
    res.json(blog);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching blog" });
  }
});

// Get single blog (admin - can access unpublished)
router.get("/admin/:id", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });
    res.json(blog);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching blog" });
  }
});

// Create blog (admin only) - with file upload support
router.post("/", protect, requireRole(["ADMIN"]), upload.single('file'), handleMulterError, async (req, res) => {
  try {
    const blogData = { ...req.body };
    
    // Handle file upload
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // PDF file upload
        blogData.pdfUrl = `/uploads/blogs/${req.file.filename}`;
        blogData.pdfFileName = req.file.originalname;
        blogData.fileSize = formatFileSize(req.file.size);
        blogData.fileType = 'pdf';
        blogData.isPdfPost = true;
        blogData.content = ""; // Clear content for PDF posts
      } else {
        // Image file upload
        blogData.imageUrl = `/uploads/blogs/${req.file.filename}`;
        blogData.fileType = 'image';
        blogData.isPdfPost = false;
      }
    }

    // Convert string booleans to actual booleans
    if (typeof blogData.published === 'string') {
      blogData.published = blogData.published === 'true';
    }
    if (typeof blogData.isPdfPost === 'string') {
      blogData.isPdfPost = blogData.isPdfPost === 'true';
    }

    const blog = new Blog(blogData);
    await blog.save();
    res.status(201).json(blog);
  } catch (err) {
    console.error('Error creating blog:', err);
    
    // Clean up uploaded file if there was an error
    if (req.file) {
      const filePath = path.join(__dirname, '../uploads/blogs', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    res.status(400).json({ message: "Error creating blog: " + err.message });
  }
});

// Update blog (admin only) - with file upload support
router.put("/:id", protect, requireRole(["ADMIN"]), upload.single('file'), handleMulterError, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    const updateData = { ...req.body };
    
    // Handle file upload
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // Delete old PDF if exists
        if (blog.pdfUrl) {
          const oldFilePath = path.join(__dirname, '..', blog.pdfUrl);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        // Delete old image if exists (replacing with PDF)
        if (blog.imageUrl) {
          const oldImagePath = path.join(__dirname, '..', blog.imageUrl);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
        
        // Update with new PDF
        updateData.pdfUrl = `/uploads/blogs/${req.file.filename}`;
        updateData.pdfFileName = req.file.originalname;
        updateData.fileSize = formatFileSize(req.file.size);
        updateData.fileType = 'pdf';
        updateData.isPdfPost = true;
        updateData.content = ""; // Clear content for PDF posts
        updateData.imageUrl = null; // Clear image URL when PDF is uploaded
      } else {
        // Delete old image if exists
        if (blog.imageUrl && blog.imageUrl.startsWith('/uploads/')) {
          const oldFilePath = path.join(__dirname, '..', blog.imageUrl);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        // Delete old PDF if exists (replacing with image)
        if (blog.pdfUrl) {
          const oldPdfPath = path.join(__dirname, '..', blog.pdfUrl);
          if (fs.existsSync(oldPdfPath)) {
            fs.unlinkSync(oldPdfPath);
          }
        }
        
        // Update with new image
        updateData.imageUrl = `/uploads/blogs/${req.file.filename}`;
        updateData.fileType = 'image';
        updateData.isPdfPost = false;
        updateData.pdfUrl = null; // Clear PDF URL when image is uploaded
        updateData.pdfFileName = null;
        updateData.fileSize = null;
      }
    }

    // Convert string booleans to actual booleans
    if (typeof updateData.published === 'string') {
      updateData.published = updateData.published === 'true';
    }
    if (typeof updateData.isPdfPost === 'string') {
      updateData.isPdfPost = updateData.isPdfPost === 'true';
    }

    updateData.updatedAt = Date.now();

    const updatedBlog = await Blog.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    res.json(updatedBlog);
  } catch (err) {
    console.error('Error updating blog:', err);
    
    // Clean up uploaded file if there was an error
    if (req.file) {
      const filePath = path.join(__dirname, '../uploads/blogs', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    res.status(400).json({ message: "Error updating blog: " + err.message });
  }
});

// Delete blog (admin only)
router.delete("/:id", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    // Delete associated files
    if (blog.imageUrl && blog.imageUrl.startsWith('/uploads/')) {
      const imagePath = path.join(__dirname, '..', blog.imageUrl);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    if (blog.pdfUrl && blog.pdfUrl.startsWith('/uploads/')) {
      const pdfPath = path.join(__dirname, '..', blog.pdfUrl);
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    }

    await Blog.findByIdAndDelete(req.params.id);
    res.json({ message: "Blog deleted successfully" });
  } catch (err) {
    console.error('Error deleting blog:', err);
    res.status(500).json({ message: "Error deleting blog" });
  }
});

// Add this route to serve PDF files (add it before other routes)
router.get("/pdf/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../uploads/blogs', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "PDF file not found" });
    }

    // Set appropriate headers for PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (err) {
    console.error('Error serving PDF:', err);
    res.status(500).json({ message: "Error serving PDF file" });
  }
});

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;