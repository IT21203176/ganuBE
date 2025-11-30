const express = require("express");
const router = express.Router();
const Event = require("../models/Event");
const { protect, requireRole } = require("../middleware/authMiddleware");
const { 
  createUploadMiddleware, 
  handleMulterError, 
  deleteFromCloudinary,
  formatFileSize 
} = require("../config/cloudinary");

// Create upload middleware for events
const upload = createUploadMiddleware('ganu/events', 20);

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
    
    // Handle file upload from Cloudinary
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // PDF file upload
        eventData.pdfUrl = req.file.path; // Cloudinary URL
        eventData.pdfFileName = req.file.originalname;
        eventData.fileSize = formatFileSize(req.file.size);
        eventData.fileType = 'pdf';
      } else {
        // Image file upload
        eventData.imageUrl = req.file.path; // Cloudinary URL
        eventData.fileType = 'image';
      }
    }
    
    const event = new Event(eventData);
    await event.save();
    res.status(201).json(event);
  } catch (err) {
    console.error('Error creating event:', err);
    
    // Clean up uploaded file from Cloudinary if there was an error
    if (req.file && req.file.path) {
      await deleteFromCloudinary(req.file.path);
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
    
    // Handle file upload from Cloudinary
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // Delete old PDF from Cloudinary if exists
        if (event.pdfUrl) {
          await deleteFromCloudinary(event.pdfUrl);
        }
        // Delete old image from Cloudinary if exists (replacing with PDF)
        if (event.imageUrl) {
          await deleteFromCloudinary(event.imageUrl);
        }
        
        // Update with new PDF
        updateData.pdfUrl = req.file.path; // Cloudinary URL
        updateData.pdfFileName = req.file.originalname;
        updateData.fileSize = formatFileSize(req.file.size);
        updateData.fileType = 'pdf';
        updateData.imageUrl = null; // Clear image URL when PDF is uploaded
      } else {
        // Delete old image from Cloudinary if exists
        if (event.imageUrl) {
          await deleteFromCloudinary(event.imageUrl);
        }
        // Delete old PDF from Cloudinary if exists (replacing with image)
        if (event.pdfUrl) {
          await deleteFromCloudinary(event.pdfUrl);
        }
        
        // Update with new image
        updateData.imageUrl = req.file.path; // Cloudinary URL
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
    
    // Clean up uploaded file from Cloudinary if there was an error
    if (req.file && req.file.path) {
      await deleteFromCloudinary(req.file.path);
    }
    
    res.status(400).json({ message: "Error updating event: " + err.message });
  }
});

// Delete event (admin only)
router.delete("/:id", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Delete associated files from Cloudinary
    if (event.imageUrl) {
      await deleteFromCloudinary(event.imageUrl);
    }

    if (event.pdfUrl) {
      await deleteFromCloudinary(event.pdfUrl);
    }

    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: "Event deleted successfully" });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ message: "Error deleting event" });
  }
});

module.exports = router;
