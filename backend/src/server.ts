import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { notFoundHandler } from "./middleware/notFound.middleware.js";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "VerifyAddress NG API is running",
    timestamp: new Date().toISOString(),
  });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

async function startServer(): Promise<void> {
  try {
    await connectDatabase();

    app.listen(env.PORT, () => {
      console.log(`VerifyAddress NG API running on port ${env.PORT}`);
      console.log(`Environment: ${env.NODE_ENV}`);
    });
  } catch (error) {
    console.error("Application startup failed:", error);
    process.exit(1);
  }
}

startServer();