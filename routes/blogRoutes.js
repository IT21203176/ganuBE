const express = require("express");
const router = express.Router();
const Blog = require("../models/Blog");
const { protect, requireRole } = require("../middleware/authMiddleware");
const { 
  createUploadMiddleware, 
  handleMulterError, 
  deleteFromCloudinary,
  formatFileSize 
} = require("../config/cloudinary");

// Create upload middleware for blogs
const upload = createUploadMiddleware('ganu/blogs', 20);

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
    
    // Handle file upload from Cloudinary
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // PDF file upload
        blogData.pdfUrl = req.file.path; // Cloudinary URL
        blogData.pdfFileName = req.file.originalname;
        blogData.fileSize = formatFileSize(req.file.size);
        blogData.fileType = 'pdf';
        blogData.isPdfPost = true;
        blogData.content = ""; // Clear content for PDF posts
      } else {
        // Image file upload
        blogData.imageUrl = req.file.path; // Cloudinary URL
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
    
    // Clean up uploaded file from Cloudinary if there was an error
    if (req.file && req.file.path) {
      await deleteFromCloudinary(req.file.path);
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
    
    // Handle file upload from Cloudinary
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // Delete old PDF from Cloudinary if exists
        if (blog.pdfUrl) {
          await deleteFromCloudinary(blog.pdfUrl);
        }
        // Delete old image from Cloudinary if exists (replacing with PDF)
        if (blog.imageUrl) {
          await deleteFromCloudinary(blog.imageUrl);
        }
        
        // Update with new PDF
        updateData.pdfUrl = req.file.path; // Cloudinary URL
        updateData.pdfFileName = req.file.originalname;
        updateData.fileSize = formatFileSize(req.file.size);
        updateData.fileType = 'pdf';
        updateData.isPdfPost = true;
        updateData.content = ""; // Clear content for PDF posts
        updateData.imageUrl = null; // Clear image URL when PDF is uploaded
      } else {
        // Delete old image from Cloudinary if exists
        if (blog.imageUrl) {
          await deleteFromCloudinary(blog.imageUrl);
        }
        // Delete old PDF from Cloudinary if exists (replacing with image)
        if (blog.pdfUrl) {
          await deleteFromCloudinary(blog.pdfUrl);
        }
        
        // Update with new image
        updateData.imageUrl = req.file.path; // Cloudinary URL
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
    
    // Clean up uploaded file from Cloudinary if there was an error
    if (req.file && req.file.path) {
      await deleteFromCloudinary(req.file.path);
    }
    
    res.status(400).json({ message: "Error updating blog: " + err.message });
  }
});

// Delete blog (admin only)
router.delete("/:id", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    // Delete associated files from Cloudinary
    if (blog.imageUrl) {
      await deleteFromCloudinary(blog.imageUrl);
    }

    if (blog.pdfUrl) {
      await deleteFromCloudinary(blog.pdfUrl);
    }

    await Blog.findByIdAndDelete(req.params.id);
    res.json({ message: "Blog deleted successfully" });
  } catch (err) {
    console.error('Error deleting blog:', err);
    res.status(500).json({ message: "Error deleting blog" });
  }
});

module.exports = router;
