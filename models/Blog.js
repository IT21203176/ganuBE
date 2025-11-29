const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String }, // Make optional for PDF posts
  excerpt: { type: String },
  author: { type: String, required: true },
  imageUrl: { type: String }, // For image files
  pdfUrl: { type: String }, // For PDF files
  pdfFileName: { type: String }, // Original PDF file name
  fileSize: { type: String }, // File size for display
  fileType: { type: String, enum: ["image", "pdf"], default: null }, // Track file type
  isPdfPost: { type: Boolean, default: false }, // Flag to identify PDF posts
  published: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Blog", blogSchema);