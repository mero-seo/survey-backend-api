const fs = require("fs");
const path = require("path");

console.log("🚀 Setting up Survey Backend API for development...\n");

// Check if .env file exists
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  console.log("✅ .env file already exists");
} else {
  console.log("📝 Creating .env file...");

  const envContent = `# Server Configuration
NODE_ENV=development
PORT=3000
API_VERSION=v1

# Database Configuration
DATABASE_URL="mongodb+srv://meroseoofficial:dB5PEuMdcsSSNaXv@cluster0.szvs8ti.mongodb.net/survey_app?retryWrites=true&w=majority&appName=Cluster0"

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here-change-this-in-production
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Redis Configuration (for sessions and caching)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Email Configuration (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@surveyapp.com
FROM_NAME="Survey App"

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads

# Monitoring & Logging
LOG_LEVEL=info
SENTRY_DSN=

# Admin Configuration
ADMIN_EMAIL=admin@surveyapp.com
ADMIN_PASSWORD=secure-admin-password

# Security
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCK_TIME=3600000

# Export Configuration
EXPORT_MAX_RECORDS=50000
EXPORT_TEMP_DIR=./temp`;

  fs.writeFileSync(envPath, envContent);
  console.log("✅ .env file created successfully");
}

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
  console.log("✅ Created logs directory");
}

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
  console.log("✅ Created uploads directory");
}

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
  console.log("✅ Created temp directory");
}

console.log("\n🎉 Setup complete!");
console.log("\n📋 Next steps:");
console.log("1. Run: npm install (if not already done)");
console.log("2. Run: npx prisma generate");
console.log("3. Run: npx prisma db push");
console.log("4. Run: npm run dev");
console.log("\n🌐 Your API will be available at:");
console.log("   - Health check: http://localhost:3000/health");
console.log("   - API docs: http://localhost:3000/api/v1/docs");
console.log("   - API base: http://localhost:3000/api/v1");
console.log(
  "\n⚠️  Note: Make sure to update the JWT_SECRET and JWT_REFRESH_SECRET in .env for production use!"
);
