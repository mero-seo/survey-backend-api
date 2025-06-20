import app from "./server";
import { config } from "./config/env";
import { logger } from "./config/logger";

const PORT = config.port || 3000;

const server = app.listen(PORT, () => {
  logger.info(`🚀 Server is running on port ${PORT}`);
  logger.info(`📊 Environment: ${config.env}`);
  logger.info(`🔗 API Version: ${config.apiVersion}`);
  logger.info(`🌐 Health check: http://localhost:${PORT}/health`);
  logger.info(
    `📚 API docs: http://localhost:${PORT}/api/${config.apiVersion}/docs`
  );
  logger.info(`🔌 API base: http://localhost:${PORT}/api/${config.apiVersion}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Process terminated");
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(() => {
    logger.info("Process terminated");
  });
});

export default server;
