const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  date: { type: Date, required: true },
  location: { type: String, required: true },
  type: {
    type: String,
    enum: ["news", "event"],
    required: true,
  },
  imageUrl: { type: String }, // For image files
  pdfUrl: { type: String }, // For PDF files
  pdfFileName: { type: String }, // Original PDF file name
  fileSize: { type: String }, // File size for display
  fileType: { type: String, enum: ["image", "pdf"], default: null }, // Track file type
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Event", eventSchema);