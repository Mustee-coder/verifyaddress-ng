export class AppError extends Error {
  public readonly statusCode: number;
  public readonly status: "fail" | "error";
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    isOperational = true
  ) {
    super(message);

    this.statusCode = statusCode;
    this.status = statusCode >= 500 ? "error" : "fail";
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}
