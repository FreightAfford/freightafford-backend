import cloudinary from "../configurations/cloudinary.configuration.js";
import AppError from "../errors/app.error.js";
import BillOfLading from "../models/bl.model.js";
import Booking from "../models/booking.model.js";
import { sendBillOfLadingNotification } from "../services/booking.service.js";
import { uploadToCloudinary } from "../utils/upload-to-cloudinary.js";
export const uploadBillOfLading = async (req, res, next) => {
    const { bookingId, type } = req.body;
    if (!req.file)
        return next(new AppError("No file uploaded", 400));
    const booking = await Booking.findById(bookingId).populate("customer", "email fullname");
    if (!booking)
        return next(new AppError("Booking not found", 404));
    //   Upload to Cloudinary
    const result = await uploadToCloudinary(req.file);
    const fileSize = result.bytes || req.file.size;
    const lastBL = await BillOfLading.findOne({ booking: bookingId, type }).sort({
        createdAt: -1,
    });
    const version = lastBL ? lastBL.version + 1 : 1;
    const customer = booking.customer;
    const bill = new BillOfLading({
        booking: bookingId,
        bookingNumber: booking.bookingNumber,
        type,
        documentUrl: result.secure_url,
        documentPublicId: result.public_id,
        version,
        status: type === "house" ? "draft" : "finalized",
        uploadedBy: req.user._id,
        fileSize,
        customer: booking.customer,
        customerName: customer.fullname,
    });
    const { error } = await sendBillOfLadingNotification(customer.email, customer.fullname, booking.bookingNumber, bill.status, bill.type);
    if (error)
        return next(new AppError("Couldn't send bill of lading notification", 400));
    await bill.save();
    res.status(201).json({
        status: "success",
        message: "Bill of Lading uploaded successfully",
        data: bill,
    });
};
export const getBookingBL = async (req, res, next) => {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId);
    if (!booking)
        return next(new AppError("Booking not found", 404));
    const bls = await BillOfLading.find({ booking: bookingId })
        .sort({
        createdAt: -1,
    })
        .select("type documentUrl documentPublicId version status fileSize createdAt");
    if (!bls.length)
        return res.status(200).json({
            status: "success",
            message: "No Bill of Lading found",
        });
    res.status(200).json({ status: "success", data: bls });
};
export const deleteBillOfLading = async (req, res, next) => {
    const { blId } = req.params;
    const bill = await BillOfLading.findById(blId);
    if (!bill)
        return next(new AppError("Bill of Lading not found", 404));
    await cloudinary.uploader.destroy(bill.documentPublicId);
    await bill.deleteOne();
    res.status(200).json({
        status: "success",
        message: "Bill of Lading deleted successfully",
    });
};
export const getCustomerBLs = async (req, res, next) => {
    const customerId = req.user._id;
    const bls = await BillOfLading.find({
        customer: customerId,
    })
        .sort({ createdAt: -1 })
        .select("type documentUrl version status fileSize createdAt booking")
        .populate("booking", "bookingNumber");
    res.status(200).json({
        status: "success",
        results: bls.length,
        data: bls,
    });
};
export const getBLs = async (req, res, next) => {
    const bls = await BillOfLading.find()
        .sort({ createdAt: -1 })
        .select("type documentUrl version status fileSize createdAt booking")
        .populate("booking", "bookingNumber");
    res.status(200).json({
        status: "success",
        results: bls.length,
        data: bls,
    });
};
//# sourceMappingURL=bl.controller.js.map