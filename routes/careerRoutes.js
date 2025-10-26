const express = require("express");
const router = express.Router();
const Career = require("../models/Career");
const { protect, requireRole } = require("../middleware/authMiddleware");

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

// Create career (admin only)
router.post("/", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const career = new Career(req.body);
    await career.save();
    res.status(201).json(career);
  } catch (err) {
    res.status(400).json({ message: "Error creating career" });
  }
});

// Update career (admin only)
router.put("/:id", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const career = await Career.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    );
    if (!career) return res.status(404).json({ message: "Career not found" });
    res.json(career);
  } catch (err) {
    res.status(400).json({ message: "Error updating career" });
  }
});

// Delete career (admin only)
router.delete("/:id", protect, requireRole(["ADMIN"]), async (req, res) => {
  try {
    const career = await Career.findByIdAndDelete(req.params.id);
    if (!career) return res.status(404).json({ message: "Career not found" });
    res.json({ message: "Career deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting career" });
  }
});

module.exports = router;