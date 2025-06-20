#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    console.log("🔧 Creating admin user...");

    // Check if admin user already exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email: "admin@survey.com" },
    });

    if (existingAdmin) {
      console.log("✅ Admin user already exists");
      console.log(`Email: ${existingAdmin.email}`);
      console.log(`Role: ${existingAdmin.role}`);
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash("admin123", 12);

    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        email: "admin@survey.com",
        name: "System Administrator",
        password: hashedPassword,
        role: "SUPER_ADMIN",
        permissions: [
          "users:read",
          "users:write",
          "users:delete",
          "surveys:read",
          "surveys:write",
          "surveys:delete",
          "devices:read",
          "devices:write",
          "devices:delete",
          "system:admin",
        ],
        organization: "Survey App",
        isActive: true,
      },
    });

    console.log("✅ Admin user created successfully!");
    console.log(`Email: ${adminUser.email}`);
    console.log(`Role: ${adminUser.role}`);
    console.log("Password: admin123");
    console.log("\n⚠️  Please change the password after first login!");
  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createAdminUser();
