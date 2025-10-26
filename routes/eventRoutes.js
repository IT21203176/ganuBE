const express = require("express");
const router = express.Router();
const Event = require("../models/Event");
const { protect, requireRole } = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure uploads directory exists
const eventsUploadDir = path.join(__dirname, "../uploads/events");
if (!fs.existsSync(eventsUploadDir)) {
  fs.mkdirSync(eventsUploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, eventsUploadDir);
  },
  filename: function (req, file, cb) {
    // Create unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, "event-" + uniqueSuffix + extension);
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

// Get all events (public)
router.get("/", async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    
    // Convert image paths to absolute URLs
    const eventsWithAbsoluteUrls = events.map(event => {
      const eventObj = event.toObject();
      if (eventObj.imageUrl) {
        eventObj.imageUrl = `${req.protocol}://${req.get('host')}${eventObj.imageUrl}`;
      }
      return eventObj;
    });
    
    res.json(eventsWithAbsoluteUrls);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching events" });
  }
});

// Get single event (public)
router.get("/:id", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    
    const eventObj = event.toObject();
    // Convert image path to absolute URL
    if (eventObj.imageUrl) {
      eventObj.imageUrl = `${req.protocol}://${req.get('host')}${eventObj.imageUrl}`;
    }
    
    res.json(eventObj);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching event" });
  }
});

// Create event (admin only) - with file upload
router.post("/", protect, requireRole(["ADMIN"]), upload.single("image"), async (req, res) => {
  try {
    const { title, description, date, location } = req.body;
    
    // Validate required fields
    if (!title || !description || !date || !location) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const eventData = {
      title,
      description,
      date,
      location,
    };

    // Handle image upload
    if (req.file) {
      eventData.imageUrl = `/api/events/uploads/${req.file.filename}`;
      eventData.imageFileName = req.file.filename;
    }

    const event = new Event(eventData);
    await event.save();
    
    // Convert image path to absolute URL in response
    const eventObj = event.toObject();
    if (eventObj.imageUrl) {
      eventObj.imageUrl = `${req.protocol}://${req.get('host')}${eventObj.imageUrl}`;
    }
    
    res.status(201).json(eventObj);
  } catch (err) {
    // Clean up uploaded file if there's an error
    if (req.file) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error("Error deleting uploaded file:", unlinkErr);
      });
    }
    
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File too large. Maximum size is 5MB." });
      }
    }
    
    res.status(400).json({ message: "Error creating event: " + err.message });
  }
});

// Update event (admin only) - with file upload
router.put("/:id", protect, requireRole(["ADMIN"]), upload.single("image"), async (req, res) => {
  try {
    const { title, description, date, location, removeImage } = req.body;
    const event = await Event.findById(req.params.id);
    
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Update fields
    if (title) event.title = title;
    if (description) event.description = description;
    if (date) event.date = date;
    if (location) event.location = location;
    event.updatedAt = Date.now();

    // Handle image removal
    if (removeImage === "true" && event.imageFileName) {
      // Delete old image file
      const oldImagePath = path.join(eventsUploadDir, event.imageFileName);
      if (fs.existsSync(oldImagePath)) {
        fs.unlink(oldImagePath, (err) => {
          if (err) console.error("Error deleting old image:", err);
        });
      }
      event.imageUrl = undefined;
      event.imageFileName = undefined;
    }

    // Handle new image upload
    if (req.file) {
      // Delete old image if it exists
      if (event.imageFileName) {
        const oldImagePath = path.join(eventsUploadDir, event.imageFileName);
        if (fs.existsSync(oldImagePath)) {
          fs.unlink(oldImagePath, (err) => {
            if (err) console.error("Error deleting old image:", err);
          });
        }
      }
      
      event.imageUrl = `/api/events/uploads/${req.file.filename}`;
      event.imageFileName = req.file.filename;
    }

    await event.save();
    
    // Convert image path to absolute URL in response
    const eventObj = event.toObject();
    if (eventObj.imageUrl) {
      eventObj.imageUrl = `${req.protocol}://${req.get('host')}${eventObj.imageUrl}`;
    }
    
    res.json(eventObj);
  } catch (err) {
    // Clean up uploaded file if there's an error
    if (req.file) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error("Error deleting uploaded file:", unlinkErr);
      });
    }
    
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File too large. Maximum size is 5MB." });
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

    // Delete associated image file
    if (event.imageFileName) {
      const imagePath = path.join(eventsUploadDir, event.imageFileName);
      if (fs.existsSync(imagePath)) {
        fs.unlink(imagePath, (err) => {
          if (err) console.error("Error deleting image file:", err);
        });
      }
    }

    await Event.findByIdAndDelete(req.params.id);
    res.json({ message: "Event deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting event" });
  }
});

module.exports = router;