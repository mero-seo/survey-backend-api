import { PrismaClient } from "@prisma/client";
import { logger } from "./logger";

declare global {
  var __prisma: PrismaClient | undefined;
}

// Prevent multiple instances of Prisma Client in development
const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    log: ["query", "info", "warn", "error"],
  });

if (process.env.NODE_ENV === "development") {
  globalThis.__prisma = prisma;
}

// Log database queries in development
if (process.env.NODE_ENV === "development") {
  logger.debug("Prisma client initialized with query logging");
}

export { prisma };
export default prisma;
