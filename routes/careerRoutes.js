const express = require("express");
const router = express.Router();
const Career = require("../models/Career");
const { protect, requireRole } = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../uploads");
const careersDir = path.join(uploadsDir, "careers");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(careersDir)) {
  fs.mkdirSync(careersDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, careersDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp and random string
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "career-" + uniqueSuffix + ext);
  },
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Get all careers (public) - only published careers
router.get("/", async (req, res) => {
  try {
    const careers = await Career.find({ 
      published: true,
      applicationDeadline: { $gte: new Date() }
    }).sort({ createdAt: -1 });
    
    // Transform image URLs to absolute URLs
    const careersWithAbsoluteUrls = careers.map(career => {
      const careerObj = career.toObject();
      if (careerObj.imageUrl) {
        careerObj.imageUrl = getAbsoluteImageUrl(req, careerObj.imageUrl);
      }
      return careerObj;
    });
    
    res.json(careersWithAbsoluteUrls);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching careers" });
  }
});

// Get all careers (admin only - including unpublished and expired)
router.get("/admin/all", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const careers = await Career.find().sort({ createdAt: -1 });
    
    // Transform image URLs to absolute URLs
    const careersWithAbsoluteUrls = careers.map(career => {
      const careerObj = career.toObject();
      if (careerObj.imageUrl) {
        careerObj.imageUrl = getAbsoluteImageUrl(req, careerObj.imageUrl);
      }
      return careerObj;
    });
    
    res.json(careersWithAbsoluteUrls);
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
    
    // Transform image URL to absolute URL
    const careerObj = career.toObject();
    if (careerObj.imageUrl) {
      careerObj.imageUrl = getAbsoluteImageUrl(req, careerObj.imageUrl);
    }
    
    res.json(careerObj);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching career" });
  }
});

// Get single career (admin - can access unpublished/expired)
router.get("/admin/:id", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const career = await Career.findById(req.params.id);
    if (!career) return res.status(404).json({ message: "Career not found" });
    
    // Transform image URL to absolute URL
    const careerObj = career.toObject();
    if (careerObj.imageUrl) {
      careerObj.imageUrl = getAbsoluteImageUrl(req, careerObj.imageUrl);
    }
    
    res.json(careerObj);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching career" });
  }
});

// Create career (admin only) with image upload
router.post("/", protect, requireRole(["ADMIN"]), upload.single("image"), async (req, res) => {
  try {
    const careerData = { ...req.body };
    
    // Parse requirements if it's a string (from FormData)
    if (typeof careerData.requirements === "string") {
      careerData.requirements = JSON.parse(careerData.requirements);
    }
    
    // Parse published field
    if (careerData.published) {
      careerData.published = careerData.published === "true";
    }

    // Handle image upload
    if (req.file) {
      const filename = req.file.filename;
      careerData.imageUrl = `/api/careers/images/${filename}`;
    }

    const career = new Career(careerData);
    await career.save();
    
    // Transform image URL to absolute URL in response
    const careerObj = career.toObject();
    if (careerObj.imageUrl) {
      careerObj.imageUrl = getAbsoluteImageUrl(req, careerObj.imageUrl);
    }
    
    res.status(201).json(careerObj);
  } catch (err) {
    // Clean up uploaded file if there's an error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ message: "Error creating career: " + err.message });
  }
});

// Update career (admin only) with image upload
router.put("/:id", protect, requireRole(["ADMIN"]), upload.single("image"), async (req, res) => {
  try {
    const career = await Career.findById(req.params.id);
    if (!career) return res.status(404).json({ message: "Career not found" });

    const updateData = { ...req.body };
    
    // Parse requirements if it's a string (from FormData)
    if (typeof updateData.requirements === "string") {
      updateData.requirements = JSON.parse(updateData.requirements);
    }
    
    // Parse published field
    if (updateData.published) {
      updateData.published = updateData.published === "true";
    }

    // Handle image upload
    if (req.file) {
      // Delete old image if it exists
      if (career.imageUrl) {
        const oldFilename = career.imageUrl.split("/").pop();
        const oldImagePath = path.join(careersDir, oldFilename);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      const filename = req.file.filename;
      updateData.imageUrl = `/api/careers/images/${filename}`;
    }

    // Handle image removal
    if (updateData.removeImage === "true") {
      if (career.imageUrl) {
        const oldFilename = career.imageUrl.split("/").pop();
        const oldImagePath = path.join(careersDir, oldFilename);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      updateData.imageUrl = null;
    }

    const updatedCareer = await Career.findByIdAndUpdate(
      req.params.id,
      { ...updateData, updatedAt: Date.now() },
      { new: true }
    );

    // Transform image URL to absolute URL in response
    const careerObj = updatedCareer.toObject();
    if (careerObj.imageUrl) {
      careerObj.imageUrl = getAbsoluteImageUrl(req, careerObj.imageUrl);
    }

    res.json(careerObj);
  } catch (err) {
    // Clean up uploaded file if there's an error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ message: "Error updating career: " + err.message });
  }
});

// Delete career (admin only) - also delete associated image
router.delete("/:id", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const career = await Career.findById(req.params.id);
    if (!career) return res.status(404).json({ message: "Career not found" });

    // Delete associated image file
    if (career.imageUrl) {
      const filename = career.imageUrl.split("/").pop();
      const imagePath = path.join(careersDir, filename);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await Career.findByIdAndDelete(req.params.id);
    res.json({ message: "Career deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting career" });
  }
});

// Helper function to convert relative URL to absolute URL
function getAbsoluteImageUrl(req, imageUrl) {
  if (!imageUrl) return null;
  
  // If it's already an absolute URL, return as is
  if (imageUrl.startsWith('http')) {
    return imageUrl;
  }
  
  // Construct absolute URL
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}${imageUrl}`;
}

// Serve career images (this route is now handled in server.js)
// But we keep this for backward compatibility
router.use("/images", express.static(careersDir));

module.exports = router;