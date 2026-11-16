
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check route
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "VerifyAddress NG API is running",
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`VerifyAddress NG API running on port ${PORT}`);
});
