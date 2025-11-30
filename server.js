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
    const allowedOrigins = [
      "https://ganuprofessional.lk",
      "https://www.ganuprofessional.lk",
      "https://ganu-fe.vercel.app",
      "https://www.ganu-fe.vercel.app",
      "http://localhost:3000"
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With", 
    "Accept",
    "Cache-Control",
    "Pragma"
  ],
  exposedHeaders: ["Content-Length", "Authorization"],
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests globally
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files - serve with proper headers
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  setHeaders: (res, filePath) => {
    // Set proper content-type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (ext === '.png') {
      res.setHeader('Content-Type', 'image/png');
    } else if (ext === '.gif') {
      res.setHeader('Content-Type', 'image/gif');
    } else if (ext === '.webp') {
      res.setHeader('Content-Type', 'image/webp');
    } else if (ext === '.svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    }
    
    // Set cache headers for images (cache for 1 year)
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (ext === '.pdf') {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// Legacy route for blog PDFs
app.use("/api/blogs/pdf", express.static(path.join(__dirname, "uploads/blogs")));

// Add cache control headers for API routes only (not static files)
app.use((req, res, next) => {
  // Skip cache for API routes, but not for static files
  if (req.path.startsWith('/api/') && !req.path.startsWith('/api/blogs/pdf') && !req.path.startsWith('/uploads')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/blogs", require("./routes/blogRoutes"));
app.use("/api/careers", require("./routes/careerRoutes"));
app.use("/api/images", require("./routes/imageRoutes"));
app.use("/api/contact", require("./routes/contactRoutes"));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    cors: "enabled"
  });
});

// Test endpoint to verify data
app.get("/api/debug/events", async (req, res) => {
  try {
    const Event = require("./models/Event");
    const events = await Event.find().sort({ date: 1 });
    console.log(`DEBUG: Found ${events.length} events in database`);
    res.json({
      count: events.length,
      events: events,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('DEBUG Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Test CORS endpoint
app.get("/api/cors-test", (req, res) => {
  res.json({
    message: "CORS is working!",
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));