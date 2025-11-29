const express = require("express");
const router = express.Router();
const Event = require("../models/Event");
const { protect, requireRole } = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/events');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'event-' + uniqueSuffix + path.extname(file.originalname));
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

// Get all events (public) - supports filtering by type
router.get("/", async (req, res) => {
  try {
    const { type } = req.query;
    const query = {};
    
    // Filter by type if provided
    if (type && (type === "news" || type === "event")) {
      query.type = type;
    }
    
    const events = await Event.find(query).sort({ date: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching events" });
  }
});

// Get all news (public) - convenience endpoint
router.get("/news", async (req, res) => {
  try {
    const news = await Event.find({ type: "news" }).sort({ date: -1 });
    res.json(news);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching news" });
  }
});

// Get all events (public) - convenience endpoint
router.get("/events", async (req, res) => {
  try {
    const events = await Event.find({ type: "event" }).sort({ date: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching events" });
  }
});

// Get single event (public)
router.get("/:id", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.json(event);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching event" });
  }
});

// Create event (admin only) - with file upload support
router.post("/", protect, requireRole(["ADMIN"]), upload.single('file'), handleMulterError, async (req, res) => {
  try {
    const { type, title, description, date, location } = req.body;
    
    // Validate required fields
    if (!type || !title || !description || !date || !location) {
      return res.status(400).json({ 
        message: "Type, title, description, date, and location are required" 
      });
    }
    
    // Validate type
    if (type !== "news" && type !== "event") {
      return res.status(400).json({ 
        message: "Type must be either 'news' or 'event'" 
      });
    }
    
    const eventData = {
      type,
      title,
      description,
      date: new Date(date),
      location
    };
    
    // Handle file upload
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // PDF file upload
        eventData.pdfUrl = `/uploads/events/${req.file.filename}`;
        eventData.pdfFileName = req.file.originalname;
        eventData.fileSize = formatFileSize(req.file.size);
        eventData.fileType = 'pdf';
      } else {
        // Image file upload
        eventData.imageUrl = `/uploads/events/${req.file.filename}`;
        eventData.fileType = 'image';
      }
    }
    
    const event = new Event(eventData);
    await event.save();
    res.status(201).json(event);
  } catch (err) {
    console.error('Error creating event:', err);
    
    // Clean up uploaded file if there was an error
    if (req.file) {
      const filePath = path.join(__dirname, '../uploads/events', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    res.status(400).json({ message: "Error creating event: " + err.message });
  }
});

// Update event (admin only) - with file upload support
router.put("/:id", protect, requireRole(["ADMIN"]), upload.single('file'), handleMulterError, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const { type, date, ...otherFields } = req.body;
    const updateData = { ...otherFields, updatedAt: Date.now() };
    
    // Validate type if provided
    if (type !== undefined) {
      if (type !== "news" && type !== "event") {
        return res.status(400).json({ 
          message: "Type must be either 'news' or 'event'" 
        });
      }
      updateData.type = type;
    }
    
    // Convert date string to Date object if provided
    if (date) {
      updateData.date = new Date(date);
    }
    
    // Handle file upload
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // Delete old PDF if exists
        if (event.pdfUrl) {
          const oldFilePath = path.join(__dirname, '..', event.pdfUrl);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        // Delete old image if exists (replacing with PDF)
        if (event.imageUrl) {
          const oldImagePath = path.join(__dirname, '..', event.imageUrl);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
        
        // Update with new PDF
        updateData.pdfUrl = `/uploads/events/${req.file.filename}`;
        updateData.pdfFileName = req.file.originalname;
        updateData.fileSize = formatFileSize(req.file.size);
        updateData.fileType = 'pdf';
        updateData.imageUrl = null; // Clear image URL when PDF is uploaded
      } else {
        // Delete old image if exists
        if (event.imageUrl && event.imageUrl.startsWith('/uploads/')) {
          const oldFilePath = path.join(__dirname, '..', event.imageUrl);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
        // Delete old PDF if exists (replacing with image)
        if (event.pdfUrl) {
          const oldPdfPath = path.join(__dirname, '..', event.pdfUrl);
          if (fs.existsSync(oldPdfPath)) {
            fs.unlinkSync(oldPdfPath);
          }
        }
        
        // Update with new image
        updateData.imageUrl = `/uploads/events/${req.file.filename}`;
        updateData.fileType = 'image';
        updateData.pdfUrl = null; // Clear PDF URL when image is uploaded
        updateData.pdfFileName = null;
        updateData.fileSize = null;
      }
    }
    
    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    res.json(updatedEvent);
  } catch (err) {
    console.error('Error updating event:', err);
    
    // Clean up uploaded file if there was an error
    if (req.file) {
      const filePath = path.join(__dirname, '../uploads/events', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    res.status(400).json({ message: "Error updating event: " + err.message });
  }
});

// Delete event (admin only)
router.delete("/:id", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Delete associated files
    if (event.imageUrl && event.imageUrl.startsWith('/uploads/')) {
      const imagePath = path.join(__dirname, '..', event.imageUrl);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    if (event.pdfUrl && event.pdfUrl.startsWith('/uploads/')) {
      const pdfPath = path.join(__dirname, '..', event.pdfUrl);
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    }

    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: "Event deleted successfully" });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ message: "Error deleting event" });
  }
});

module.exports = router;