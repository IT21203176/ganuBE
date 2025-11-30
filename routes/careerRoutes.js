const express = require("express");
const router = express.Router();
const Career = require("../models/Career");
const { protect, requireRole } = require("../middleware/authMiddleware");
const { 
  createUploadMiddleware, 
  handleMulterError, 
  deleteFromCloudinary,
  formatFileSize 
} = require("../config/cloudinary");

// Create upload middleware for careers
const upload = createUploadMiddleware('ganu/careers', 20);

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
    
    // Handle file upload from Cloudinary
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // PDF file upload
        careerData.pdfUrl = req.file.path; // Cloudinary URL
        careerData.pdfFileName = req.file.originalname;
        careerData.fileSize = formatFileSize(req.file.size);
        careerData.fileType = 'pdf';
      } else {
        // Image file upload
        careerData.imageUrl = req.file.path; // Cloudinary URL
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
    
    // Clean up uploaded file from Cloudinary if there was an error
    if (req.file && req.file.path) {
      await deleteFromCloudinary(req.file.path);
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
    
    // Handle file upload from Cloudinary
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // Delete old PDF from Cloudinary if exists
        if (career.pdfUrl) {
          await deleteFromCloudinary(career.pdfUrl);
        }
        // Delete old image from Cloudinary if exists (replacing with PDF)
        if (career.imageUrl) {
          await deleteFromCloudinary(career.imageUrl);
        }
        
        // Update with new PDF
        updateData.pdfUrl = req.file.path; // Cloudinary URL
        updateData.pdfFileName = req.file.originalname;
        updateData.fileSize = formatFileSize(req.file.size);
        updateData.fileType = 'pdf';
        updateData.imageUrl = null; // Clear image URL when PDF is uploaded
      } else {
        // Delete old image from Cloudinary if exists
        if (career.imageUrl) {
          await deleteFromCloudinary(career.imageUrl);
        }
        // Delete old PDF from Cloudinary if exists (replacing with image)
        if (career.pdfUrl) {
          await deleteFromCloudinary(career.pdfUrl);
        }
        
        // Update with new image
        updateData.imageUrl = req.file.path; // Cloudinary URL
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
    
    // Clean up uploaded file from Cloudinary if there was an error
    if (req.file && req.file.path) {
      await deleteFromCloudinary(req.file.path);
    }
    
    res.status(400).json({ message: "Error updating career: " + err.message });
  }
});

// Delete career (admin only)
router.delete("/:id", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const career = await Career.findById(req.params.id);
    if (!career) return res.status(404).json({ message: "Career not found" });

    // Delete associated files from Cloudinary
    if (career.imageUrl) {
      await deleteFromCloudinary(career.imageUrl);
    }

    if (career.pdfUrl) {
      await deleteFromCloudinary(career.pdfUrl);
    }

    await Career.findByIdAndDelete(req.params.id);
    res.json({ message: "Career deleted successfully" });
  } catch (err) {
    console.error('Error deleting career:', err);
    res.status(500).json({ message: "Error deleting career" });
  }
});

module.exports = router;
