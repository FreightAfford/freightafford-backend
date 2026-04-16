import AppError from "../errors/app.error.js";
import { Amendment } from "../models/amendment.model.js";
import Booking from "../models/booking.model.js";
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";
export const createAmendment = async (req, res, next) => {
    const { bookingId, content } = req.body;
    const file = req.file;
    const user = req.user;
    if (user.role !== "customer")
        return next(new AppError("Only customers can submit amendment", 403));
    if (!content && !file)
        return next(new AppError("Provide amendment text or upload a PDF", 400));
    const booking = await Booking.findById(bookingId);
    if (!booking)
        return next(new AppError("Booking not found", 404));
    const blockedStatuses = ["cancelled", "delivered"];
    if (blockedStatuses.includes(booking.status))
        return next(new AppError(`Cannot submit amendment for ${booking.status} booking`, 400));
    let result;
    if (req.file)
        result = await uploadToCloudinary(file, "amendment_docs");
    const amendmentType = file ? "pdf" : "text";
    const amendment = await Amendment.create({
        booking: bookingId,
        customer: user._id,
        draftVersion: 1,
        amendmentType,
        content: content || null,
        fileUrl: result?.secure_url || null,
        filePublicId: result?.public_id || null,
        fileSize: result?.bytes || file?.size || null,
    });
    return res.status(200).json({
        status: "success",
        message: "Amendment submitted successfully",
        data: amendment,
    });
};
export const getAmendmentsByBooking = async (req, res, next) => {
    const { bookingId } = req.params;
    const amendments = await Amendment.find({ booking: bookingId })
        .sort({
        createdAt: -1,
    })
        .populate("customer", "fullname email");
    return res
        .status(200)
        .json({ status: "success", results: amendments.length, amendments });
};
export const updateAmendmentStatus = async (req, res, next) => {
    const { amendmentId } = req.params;
    const { status } = req.body;
    const user = req.user;
    if (user.role !== "admin")
        return next(new AppError("Only admins can update amendment status", 403));
    const allowedStatuses = ["reviewed", "applied"];
    if (!allowedStatuses.includes(status))
        return next(new AppError("Invalid status provided.", 400));
    const amendment = await Amendment.findById(amendmentId);
    if (!amendment)
        return next(new AppError("Amendment not found", 404));
    amendment.status = status;
    amendment.reviewedAt = new Date();
    await amendment.save();
    res.status(200).json({
        status: "success",
        message: "Amendment updated successfully.",
        data: amendment,
    });
};
export const getAmendmentById = async (req, res, next) => {
    const { amendmentId } = req.params;
    const amendment = await Amendment.findById(amendmentId);
    if (!amendment)
        return next(new AppError("Amendment not found", 404));
    res.status(200).json({ status: "success", data: amendment });
};
//# sourceMappingURL=amendment.controller.js.map