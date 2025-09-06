const express = require("express");
const router = express.Router();
const { 
  registerUser, 
  registerAgent, 
  loginUser, 
  getProfile 
} = require("../controllers/authController");
const { protect, requireRole } = require("../middleware/authMiddleware");

// Public routes
router.post("/login", loginUser);
router.post("/register", registerUser);

// Protected routes
router.get("/me", protect, getProfile);

// Admin only routes
router.post("/register-agent", protect, requireRole(["ADMIN"]), registerAgent);

module.exports = router;