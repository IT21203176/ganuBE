const express = require("express");
const router = express.Router();
const Career = require("../models/Career");
const { protect, requireRole } = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/careers');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'career-' + uniqueSuffix + path.extname(file.originalname));
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
    fileSize: 20 * 1024 * 1024 // 20MB limit for larger PDFs
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

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Get all careers (public) - only published careers
router.get("/", async (req, res) => {
  try {
    const careers = await Career.find({ 
      published: true,
      applicationDeadline: { $gte: new Date() }
    }).sort({ createdAt: -1 });
    res.json(careers);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching careers" });
  }
});

// Get all careers (admin only - including unpublished and expired)
router.get("/admin/all", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const careers = await Career.find().sort({ createdAt: -1 });
    res.json(careers);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching careers" });
  }
});

// Get single career (public) - only if published and not expired
router.get("/:id", async (req, res) => {
  try {
    const career = await Career.findOne({ 
      _id: req.params.id, 
      published: true,
      applicationDeadline: { $gte: new Date() }
    });
    if (!career) return res.status(404).json({ message: "Career not found" });
    res.json(career);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching career" });
  }
});

// Get single career (admin - can access unpublished/expired)
router.get("/admin/:id", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const career = await Career.findById(req.params.id);
    if (!career) return res.status(404).json({ message: "Career not found" });
    res.json(career);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching career" });
  }
});

// Create career (admin only) - with file upload support
router.post("/", protect, requireRole(["ADMIN"]), upload.single('file'), handleMulterError, async (req, res) => {
  try {
    const careerData = { ...req.body };
    
    // Handle file upload
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // PDF file upload
        careerData.pdfUrl = `/uploads/careers/${req.file.filename}`;
        careerData.pdfFileName = req.file.originalname;
        careerData.fileSize = formatFileSize(req.file.size);
        careerData.fileType = 'pdf';
      } else {
        // Image file upload
        careerData.imageUrl = `/uploads/careers/${req.file.filename}`;
        careerData.fileType = 'image';
      }
    }

    // Convert string booleans to actual booleans
    if (typeof careerData.published === 'string') {
      careerData.published = careerData.published === 'true';
    }

    // Convert applicationDeadline string to Date if needed
    if (careerData.applicationDeadline && typeof careerData.applicationDeadline === 'string') {
      careerData.applicationDeadline = new Date(careerData.applicationDeadline);
    }

    const career = new Career(careerData);
    await career.save();
    res.status(201).json(career);
  } catch (err) {
    console.error('Error creating career:', err);
    
    // Clean up uploaded file if there was an error
    if (req.file) {
      const filePath = path.join(__dirname, '../uploads/careers', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    res.status(400).json({ message: "Error creating career: " + err.message });
  }
});

// Update career (admin only) - with file upload support
router.put("/:id", protect, requireRole(["ADMIN"]), upload.single('file'), handleMulterError, async (req, res) => {
  try {
    const career = await Career.findById(req.params.id);
    if (!career) return res.status(404).json({ message: "Career not found" });

    const updateData = { ...req.body };
    
    // Handle file upload
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // Delete old PDF if exists
        if (career.pdfUrl) {
          const oldFilePath = path.join(__dirname, '..', career.pdfUrl);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        // Delete old image if exists (replacing with PDF)
        if (career.imageUrl) {
          const oldImagePath = path.join(__dirname, '..', career.imageUrl);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
        
        // Update with new PDF
        updateData.pdfUrl = `/uploads/careers/${req.file.filename}`;
        updateData.pdfFileName = req.file.originalname;
        updateData.fileSize = formatFileSize(req.file.size);
        updateData.fileType = 'pdf';
        updateData.imageUrl = null; // Clear image URL when PDF is uploaded
      } else {
        // Delete old image if exists
        if (career.imageUrl && career.imageUrl.startsWith('/uploads/')) {
          const oldFilePath = path.join(__dirname, '..', career.imageUrl);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        // Delete old PDF if exists (replacing with image)
        if (career.pdfUrl) {
          const oldPdfPath = path.join(__dirname, '..', career.pdfUrl);
          if (fs.existsSync(oldPdfPath)) {
            fs.unlinkSync(oldPdfPath);
          }
        }
        
        // Update with new image
        updateData.imageUrl = `/uploads/careers/${req.file.filename}`;
        updateData.fileType = 'image';
        updateData.pdfUrl = null; // Clear PDF URL when image is uploaded
        updateData.pdfFileName = null;
        updateData.fileSize = null;
      }
    }

    // Convert string booleans to actual booleans
    if (typeof updateData.published === 'string') {
      updateData.published = updateData.published === 'true';
    }

    // Convert applicationDeadline string to Date if needed
    if (updateData.applicationDeadline && typeof updateData.applicationDeadline === 'string') {
      updateData.applicationDeadline = new Date(updateData.applicationDeadline);
    }

    updateData.updatedAt = Date.now();

    const updatedCareer = await Career.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    res.json(updatedCareer);
  } catch (err) {
    console.error('Error updating career:', err);
    
    // Clean up uploaded file if there was an error
    if (req.file) {
      const filePath = path.join(__dirname, '../uploads/careers', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    res.status(400).json({ message: "Error updating career: " + err.message });
  }
});

// Delete career (admin only)
router.delete("/:id", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const career = await Career.findById(req.params.id);
    if (!career) return res.status(404).json({ message: "Career not found" });

    // Delete associated files
    if (career.imageUrl && career.imageUrl.startsWith('/uploads/')) {
      const imagePath = path.join(__dirname, '..', career.imageUrl);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    if (career.pdfUrl && career.pdfUrl.startsWith('/uploads/')) {
      const pdfPath = path.join(__dirname, '..', career.pdfUrl);
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    }

    await Career.findByIdAndDelete(req.params.id);
    res.json({ message: "Career deleted successfully" });
  } catch (err) {
    console.error('Error deleting career:', err);
    res.status(500).json({ message: "Error deleting career" });
  }
});

module.exports = router;