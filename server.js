const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const path = require("path");

// Load env variables
dotenv.config();

connectDB();

const app = express();

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      "http://localhost:3000",
      "https://ganu-fe.vercel.app",
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(
  "/api/blogs/pdf",
  express.static(path.join(__dirname, "uploads/blogs"))
);

app.use(
  "/api/careers/images",
  express.static(path.join(__dirname, "uploads/careers"))
);

app.use(
  "/api/events/uploads",
  express.static(path.join(__dirname, "uploads/events"))
);

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/blogs", require("./routes/blogRoutes"));
app.use("/api/careers", require("./routes/careerRoutes"));
app.use("/api/images", require("./routes/imageRoutes"));
app.use("/api/contact", require("./routes/contactRoutes"));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ 
    status: "OK", 
    message: "Server is running",
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));