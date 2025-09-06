const fs = require("fs");
const path = require("path");
const Image = require("../models/Image");

// POST /api/images  (admin only) - upload image
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { title, description } = req.body;
    const newImage = await Image.create({
      title: title || req.file.originalname,
      description: description || "",
      filename: req.file.filename,
      originalName: req.file.originalname,
      uploadedBy: req.user._id || req.user.id
    });

    res.status(201).json({ message: "Image uploaded", image: newImage });
  } catch (err) {
    console.error("uploadImage error:", err);
    res.status(500).json({ message: "Server error uploading image" });
  }
};

// GET /api/images  (public) - list all images
exports.getImages = async (req, res) => {
  try {
    const images = await Image.find().sort({ createdAt: -1 });
    res.json(images);
  } catch (err) {
    console.error("getImages error:", err);
    res.status(500).json({ message: "Server error fetching images" });
  }
};

// PUT /api/images/:id  (admin only) - update title/description
exports.updateImage = async (req, res) => {
  try {
    const { title, description } = req.body;
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).json({ message: "Image not found" });

    if (title !== undefined) image.title = title;
    if (description !== undefined) image.description = description;
    await image.save();

    res.json({ message: "Image updated", image });
  } catch (err) {
    console.error("updateImage error:", err);
    res.status(500).json({ message: "Server error updating image" });
  }
};

// DELETE /api/images/:id  (admin only) - delete image file + record
exports.deleteImage = async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).json({ message: "Image not found" });

    const filePath = path.join(__dirname, "../uploads", image.filename);
    // remove file if exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await Image.deleteOne({ _id: req.params.id });  
    res.json({ message: "Image deleted successfully" });
  } catch (err) {
    console.error("deleteImage error:", err);
    res.status(500).json({ message: "Server error deleting image" });
  }
};
