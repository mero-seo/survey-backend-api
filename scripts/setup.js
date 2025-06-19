#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(PROJECT_ROOT, ".env");
const ENV_EXAMPLE = path.join(PROJECT_ROOT, "env.example");

console.log("🚀 Setting up Survey Backend API...\n");

// Check Node.js version
const nodeVersion = process.version;
const requiredVersion = "v18.0.0";
if (nodeVersion < requiredVersion) {
  console.error(
    `❌ Node.js ${requiredVersion} or higher is required. Current version: ${nodeVersion}`
  );
  process.exit(1);
}
console.log(`✅ Node.js version: ${nodeVersion}`);

// Check if .env file exists
if (!fs.existsSync(ENV_FILE)) {
  if (fs.existsSync(ENV_EXAMPLE)) {
    fs.copyFileSync(ENV_EXAMPLE, ENV_FILE);
    console.log("✅ Created .env file from env.example");
    console.log("⚠️  Please update the .env file with your configuration");
  } else {
    console.log("⚠️  env.example file not found");
  }
} else {
  console.log("✅ .env file already exists");
}

// Install dependencies
try {
  console.log("\n📦 Installing dependencies...");
  execSync("npm install", { stdio: "inherit", cwd: PROJECT_ROOT });
  console.log("✅ Dependencies installed");
} catch (error) {
  console.error("❌ Failed to install dependencies");
  process.exit(1);
}

// Generate Prisma client
try {
  console.log("\n🔧 Generating Prisma client...");
  execSync("npm run prisma:generate", { stdio: "inherit", cwd: PROJECT_ROOT });
  console.log("✅ Prisma client generated");
} catch (error) {
  console.log(
    "⚠️  Prisma client generation failed. Make sure your DATABASE_URL is configured."
  );
}

// Create logs directory
const logsDir = path.join(PROJECT_ROOT, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
  console.log("✅ Created logs directory");
}

// Create uploads directory
const uploadsDir = path.join(PROJECT_ROOT, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
  console.log("✅ Created uploads directory");
}

console.log("\n🎉 Setup complete!");
console.log("\nNext steps:");
console.log(
  "1. Update your .env file with the correct database URL and other configuration"
);
console.log('2. Run "npm run prisma:push" to sync your database schema');
console.log('3. Run "npm run dev" to start the development server');
console.log("\nFor more information, check the README.md file.");
