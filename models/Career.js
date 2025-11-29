const mongoose = require("mongoose");

const careerSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  requirements: [{ type: String }],
  location: { type: String, required: true },
  type: {
    type: String,
    enum: ["full-time", "part-time", "contract"],
    required: true,
  },
  salary: { type: String },
  applicationDeadline: { type: Date, required: true },
  imageUrl: { type: String }, // For image files
  pdfUrl: { type: String }, // For PDF files
  pdfFileName: { type: String }, // Original PDF file name
  fileSize: { type: String }, // File size for display
  fileType: { type: String, enum: ["image", "pdf"], default: null }, // Track file type
  published: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Career", careerSchema);