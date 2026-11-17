import type { ErrorRequestHandler } from "express";
import { AppError } from "../utils/AppError.js";

export const errorHandler: ErrorRequestHandler = (
  err,
  _req,
  res,
  _next
) => {
  const error =
    err instanceof AppError
      ? err
      : new AppError("Internal server error", 500, false);

  if (error.statusCode >= 500) {
    // Error objects from parsers and persistence layers can retain request
    // bodies or database values. Log a constant message, never the object.
    console.error("Unhandled request error");
  }

  res.status(error.statusCode).json({
    success: false,
    status: error.status,
    message: error.isOperational
      ? error.message
      : "Internal server error",
  });
};
