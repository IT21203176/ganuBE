const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const Blog = require("../models/Blog");
const { protect, requireRole } = require("../middleware/authMiddleware");
const { 
  createUploadMiddleware, 
  handleMulterError, 
  deleteFile,
  formatFileSize,
  isVercel
} = require("../config/cloudinary");

// Create upload middleware - images go to Cloudinary, PDFs go to local storage
const upload = createUploadMiddleware(
  'ganu/blogs', // Cloudinary folder for images
  path.join(__dirname, '../uploads/blogs') // Local directory for PDFs
);

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

// Serve PDF files with proper headers (for local files only)
// For Cloudinary PDFs, use direct URL
router.get("/pdf/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../uploads/blogs', filename);
    
    // Check if file exists (only for local storage)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "PDF file not found" });
    }
    
    // Set appropriate headers for PDF inline display
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (err) {
    console.error('Error serving PDF:', err);
    res.status(500).json({ message: "Error serving PDF file" });
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
        // On Vercel: stored in Cloudinary (req.file.path is Cloudinary URL)
        // On cPanel/local: stored locally (req.file.path is local path)
        if (req.file.path.includes('cloudinary.com')) {
          // Cloudinary URL (Vercel)
          blogData.pdfUrl = req.file.path;
        } else {
          // Local path (cPanel/local)
          blogData.pdfUrl = `/uploads/blogs/${req.file.filename}`;
        }
        blogData.pdfFileName = req.file.originalname;
        blogData.fileSize = formatFileSize(req.file.size);
        blogData.fileType = 'pdf';
        blogData.isPdfPost = true;
        blogData.content = ""; // Clear content for PDF posts
        blogData.imageUrl = null;
      } else {
        // Image file upload - always stored in Cloudinary
        blogData.imageUrl = req.file.path; // Cloudinary URL
        blogData.fileType = 'image';
        blogData.isPdfPost = false;
        blogData.pdfUrl = null;
        blogData.pdfFileName = null;
        blogData.fileSize = null;
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
      if (req.file.mimetype === 'application/pdf') {
        if (req.file.path.includes('cloudinary.com')) {
          // Delete from Cloudinary
          await deleteFile(req.file.path);
        } else {
          // Delete local PDF file
          const filePath = path.join(__dirname, '../uploads/blogs', req.file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      } else {
        // Delete from Cloudinary
        await deleteFile(req.file.path);
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
          await deleteFile(blog.pdfUrl);
        }
        // Delete old image if exists (Cloudinary)
        if (blog.imageUrl) {
          await deleteFile(blog.imageUrl);
        }
        
        // Update with new PDF
        // On Vercel: stored in Cloudinary (req.file.path is Cloudinary URL)
        // On cPanel/local: stored locally (req.file.path is local path)
        if (req.file.path.includes('cloudinary.com')) {
          updateData.pdfUrl = req.file.path; // Cloudinary URL
        } else {
          updateData.pdfUrl = `/uploads/blogs/${req.file.filename}`; // Local path
        }
        updateData.pdfFileName = req.file.originalname;
        updateData.fileSize = formatFileSize(req.file.size);
        updateData.fileType = 'pdf';
        updateData.isPdfPost = true;
        updateData.content = "";
        updateData.imageUrl = null;
      } else {
        // Delete old image if exists (Cloudinary)
        if (blog.imageUrl) {
          await deleteFile(blog.imageUrl);
        }
        // Delete old PDF if exists
        if (blog.pdfUrl) {
          await deleteFile(blog.pdfUrl);
        }
        
        // Update with new image (Cloudinary)
        updateData.imageUrl = req.file.path; // Cloudinary URL
        updateData.fileType = 'image';
        updateData.isPdfPost = false;
        updateData.pdfUrl = null;
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
      if (req.file.mimetype === 'application/pdf') {
        if (req.file.path.includes('cloudinary.com')) {
          await deleteFile(req.file.path);
        } else {
          const filePath = path.join(__dirname, '../uploads/blogs', req.file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      } else {
        await deleteFile(req.file.path);
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

    // Delete associated files (handles both Cloudinary and local)
    if (blog.imageUrl) {
      await deleteFile(blog.imageUrl);
    }

    if (blog.pdfUrl) {
      await deleteFile(blog.pdfUrl);
    }

    await Blog.findByIdAndDelete(req.params.id);
    res.json({ message: "Blog deleted successfully" });
  } catch (err) {
    console.error('Error deleting blog:', err);
    res.status(500).json({ message: "Error deleting blog" });
  }
});

module.exports = router;
