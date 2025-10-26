const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const path = require("path");

// Load env variables
dotenv.config();

connectDB();

const app = express();

// Enhanced CORS configuration for production
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      "http://localhost:3000",
      "https://ganu-fe.vercel.app",
      "https://ganu-fe.vercel.app/",
      "https://ganu-fe-git-main-heshan2002s-projects.vercel.app",
      "https://ganu-fe-heshan2002s-projects.vercel.app"
    ];
    
    // Allow all vercel.app subdomains for preview deployments
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Content-Length', 'Accept']
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Enhanced body parser with better error handling
app.use(express.json({ 
  limit: '10mb' // Reduced for Vercel compatibility
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb'
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  if (req.method === 'POST' || req.method === 'PUT') {
    if (req.headers['content-type']?.includes('multipart')) {
      console.log('📁 Multipart form data received');
    } else {
      console.log('📦 Request body:', req.body);
    }
  }
  next();
});

// For Vercel, we need to handle file uploads differently
// Since Vercel has ephemeral storage, consider using cloud storage like AWS S3 or Cloudinary

// Static file serving - only for local development
if (process.env.NODE_ENV !== 'production') {
  app.use("/uploads", express.static(path.join(__dirname, "uploads")));
  app.use("/api/blogs/pdf", express.static(path.join(__dirname, "uploads/blogs")));
  app.use("/api/careers/images", express.static(path.join(__dirname, "uploads/careers")));
  app.use("/api/events/uploads", express.static(path.join(__dirname, "uploads/events")));
} else {
  // In production, serve static files from a CDN or cloud storage
  console.log('🔧 Production mode: Using cloud storage for static files');
}

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/blogs", require("./routes/blogRoutes"));
app.use("/api/careers", require("./routes/careerRoutes"));
app.use("/api/contact", require("./routes/contactRoutes"));

// Enhanced health check endpoint
app.get("/api/health", (req, res) => {
  const mongoose = require('mongoose');
  const dbStatus = mongoose.connection.readyState;
  
  const statusMap = {
    0: 'disconnected',
    1: 'connected', 
    2: 'connecting',
    3: 'disconnecting'
  };
  
  res.status(200).json({ 
    status: "OK", 
    message: "Server is running",
    database: statusMap[dbStatus] || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('🔴 Global Error Handler:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    headers: req.headers
  });

  // Mongoose validation error
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation Error',
      errors: Object.values(error.errors).map(e => e.message)
    });
  }

  // Mongoose duplicate key error
  if (error.code === 11000) {
    return res.status(400).json({
      message: 'Duplicate field value entered',
      field: Object.keys(error.keyValue)[0]
    });
  }

  // Default error
  res.status(error.status || 500).json({
    message: error.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ 
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      '/api/health',
      '/api/auth/login',
      '/api/events',
      '/api/blogs', 
      '/api/careers',
      '/api/contact'
    ]
  });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 CORS enabled for Vercel domains`);
  console.log(`📊 Database: ${process.env.MONGODB_URI ? 'Configured' : 'Missing URI'}`);
});