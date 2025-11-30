const express = require("express");
const { protect, requireRole } = require("../middleware/authMiddleware");
const {
  uploadImage,
  getImages,
  updateImage,
  deleteImage
} = require("../controllers/imageController");
const { 
  createUploadMiddleware, 
  handleMulterError
} = require("../config/cloudinary");

const router = express.Router();

// Create upload middleware for images (5 MB limit for images)
const upload = createUploadMiddleware('ganu/images', 5);

// Public: list images
router.get("/", getImages);

// Admin only: upload, edit, delete
router.post("/", protect, requireRole(["ADMIN"]), upload.single("image"), handleMulterError, uploadImage);
router.put("/:id", protect, requireRole(["ADMIN"]), updateImage);
router.delete("/:id", protect, requireRole(["ADMIN"]), deleteImage);

module.exports = router;
