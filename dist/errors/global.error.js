import envConfig from "../configurations/env.configuration.js";
import AppError from "./app.error.js";
const handleCastError = (error) => new AppError(`Invalid ${error.path}: ${error.value}`, 400);
const handleTokenExpiredError = () => new AppError("Token has expired! Generate a new OTP mail.", 401);
const handleTokenMalfunctionError = () => new AppError("Invalid Token was provided! Try again.", 401);
const handleDuplicateKeyError = (error) => {
    const field = Object.keys(error.keyValue)[0];
    const value = error.keyValue[field];
    const capitalizeField = field[0]?.toUpperCase() + field.slice(1);
    return new AppError(`${capitalizeField} ${value} already exists on our record.`, 409);
};
const handleValidationError = (error) => {
    const messages = Object.values(error.errors).map((err) => err.message);
    return new AppError(messages.join(". "), 422);
};
const globalErrorHandler = (err, req, res, next) => {
    let error = err;
    if (!(error instanceof AppError)) {
        if (error.name === "CastError")
            error = handleCastError(error);
        if (error.name === "TokenExpiredError")
            error = handleTokenExpiredError();
        if (error.name === "JsonWebTokenError")
            error = handleTokenMalfunctionError();
        if (error.name === "ValidationError")
            error = handleValidationError(error);
        if (error.code === 11000)
            error = handleDuplicateKeyError(error);
    }
    // DEVELOPMENT MODE
    if (envConfig.NODE_ENV === "development") {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        console.log(error);
        return res.status(statusCode).json({
            status: error instanceof AppError ? error.status : "error",
            message: error.message,
            stack: error.stack,
            error,
        });
    }
    // PRODUCTION MODE
    if (error instanceof AppError && error.isOperational)
        return res
            .status(error.statusCode)
            .json({ status: error.status, message: error.message });
    console.error("UNEXPECTED_ERROR:", {
        message: error.message,
        stack: error.stack,
    });
    return res.status(500).json({
        status: "error",
        message: "An unexpected error occurred. Please try again.",
    });
};
export default globalErrorHandler;
//# sourceMappingURL=global.error.js.map