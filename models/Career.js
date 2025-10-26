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
  imageUrl: { type: String }, // New field for image URL
  published: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Career", careerSchema);