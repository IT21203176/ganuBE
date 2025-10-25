const express = require("express");
const { 
  sendJoinMessage, 
  getContacts, 
  markAsRead, 
  deleteContact 
} = require("../controllers/contactController");
const { protect, requireRole } = require("../middleware/authMiddleware");
const router = express.Router();

// Public route - submit contact form
router.post("/", sendJoinMessage);

// Admin routes - protected
router.get("/admin/all", protect, requireRole(["ADMIN"]), getContacts);
router.put("/:id/read", protect, requireRole(["ADMIN"]), markAsRead);
router.delete("/:id", protect, requireRole(["ADMIN"]), deleteContact);

module.exports = router;