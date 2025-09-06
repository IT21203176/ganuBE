const express = require("express");
const multer = require("multer");
const path = require("path");
const { protect, requireRole } = require("../middleware/authMiddleware");
const {
  uploadImage,
  getImages,
  updateImage,
  deleteImage
} = require("../controllers/imageController");

const router = express.Router();

// Multer config - store in uploads/ with timestamp prefix
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads")),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_"))
});

// optional file filter - allow images only
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.test(ext)) cb(null, true);
  else cb(new Error("Only images are allowed"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

// Public: list images
router.get("/", getImages);

// Admin only: upload, edit, delete
router.post("/", protect, requireRole(["ADMIN"]), upload.single("image"), uploadImage);
router.put("/:id", protect, requireRole(["ADMIN"]), updateImage);
router.delete("/:id", protect, requireRole(["ADMIN"]), deleteImage);

module.exports = router;
