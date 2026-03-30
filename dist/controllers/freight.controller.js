import AppError from "../errors/app.error.js";
import Booking from "../models/booking.model.js";
import FreightRequest from "../models/freight.model.js";
import User from "../models/user.model.js";
import { sendAdminCustomerDecisionNotification, sendAdminFreightRequestNotification, sendCustomerAcceptedNotification, sendCustomerCounterNotification, sendCustomerRejectedNotification, } from "../services/freight.services.js";
const generateBookingNumber = () => {
    const random = Math.floor(100000 + Math.random() * 900000);
    return `FA-${new Date().getFullYear()}-${random}`;
};
// CUSTOMER: Create Request
export const createFreightRequest = async (req, res, next) => {
    const { originPort, destinationPort, commodity, cargoReadyDate, cargoWeight, proposedPrice, notes, containerSize, containerQuantity, } = req.body;
    const { error } = await sendAdminFreightRequestNotification({
        originPort,
        destinationPort,
        cargoWeight,
        proposedPrice,
        commodity,
    });
    if (error) {
        return next(new AppError("Unable to send freight request notification", 400));
    }
    const request = await FreightRequest.create({
        customer: req.user._id,
        customerName: req.user.fullname,
        customerEmail: req.user.email,
        originPort,
        destinationPort,
        commodity,
        cargoWeight,
        cargoReadyDate,
        proposedPrice,
        notes,
        containerSize,
        containerQuantity,
    });
    res.status(201).json({
        status: "success",
        message: "Freight request sent successfully.",
        data: request,
    });
};
export const getMyFreightRequest = async (req, res, next) => {
    const requests = await FreightRequest.find({ customer: req.user._id })
        .populate("customer")
        .sort({ createdAt: -1 });
    res
        .status(200)
        .json({ status: "success", results: requests.length, data: requests });
};
export const getAllFreightRequests = async (req, res, next) => {
    const requests = await FreightRequest.find()
        .populate("customer", "fullname companyName")
        .sort({ createdAt: -1 });
    res
        .status(200)
        .json({ status: "success", results: requests.length, data: requests });
};
export const acceptFreightRequest = async (req, res, next) => {
    const request = await FreightRequest.findById(req.params.id).populate("customer", "fullname email");
    if (!request)
        return next(new AppError("Freight request not found", 404));
    const user = await User.findById(request.customer);
    if (!user)
        return next(new AppError("User not found.", 404));
    if (request.status !== "pending" && request.status !== "countered")
        return next(new AppError("Request cannot be accepted", 400));
    request.status = "accepted";
    request.adminActionAt = new Date();
    const customer = request.customer;
    const booking = await Booking.create({
        bookingNumber: generateBookingNumber(),
        freightRequest: request._id,
        customer: request.customer,
        customerName: customer.fullname,
        customerEmail: customer.email,
    });
    request.booking = booking._id;
    const { error } = await sendCustomerAcceptedNotification(user.email, user.fullname, booking.bookingNumber);
    if (error) {
        return next(new AppError("Booking created but notification email failed to send.", 400));
    }
    await request.save();
    res.status(200).json({
        status: "success",
        message: "Freight request accepted",
        data: { freightRequest: request, booking },
    });
};
export const counterFreightRequest = async (req, res, next) => {
    const { counterPrice, reason } = req.body;
    if (!counterPrice || !reason)
        return next(new AppError("Missing required fields for counter request", 401));
    const request = await FreightRequest.findById(req.params.id);
    if (!request)
        return next(new AppError("Freight request not found.", 404));
    const user = await User.findById(request.customer);
    if (!user)
        return next(new AppError("User not found.", 404));
    if (request.status !== "pending")
        return next(new AppError("Request already processed.", 400));
    request.adminCounterPrice = counterPrice;
    request.counterReason = reason;
    request.status = "countered";
    request.adminActionAt = new Date();
    const { error } = await sendCustomerCounterNotification(user.email, user.fullname, counterPrice, reason);
    if (error)
        return next(new AppError("Unable to send counter freight request notification.", 400));
    await request.save();
    res.status(200).json({
        status: "success",
        message: "Counter offer sent successfully",
        data: request,
    });
};
export const rejectFreightRequest = async (req, res, next) => {
    const { reason } = req.body;
    if (!reason)
        return next(new AppError("Missing required fields for rejecting request", 401));
    const request = await FreightRequest.findById(req.params.id);
    if (!request)
        return next(new AppError("Freight request not found.", 404));
    const user = await User.findById(request.customer);
    if (!user)
        return next(new AppError("User not found.", 404));
    if (request.status !== "pending" && request.status !== "countered")
        return next(new AppError("Request already processed.", 400));
    request.status = "rejected";
    request.rejectionReason = reason;
    request.adminActionAt = new Date();
    const { error } = await sendCustomerRejectedNotification(user.email, user.fullname, reason);
    if (error)
        return next(new AppError("Unable to send reject freight request notification", 400));
    await request.save();
    res.status(200).json({
        status: "success",
        message: "Freight request rejected",
        data: request,
    });
};
export const respondToCounter = async (req, res, next) => {
    const { decision } = req.body;
    const request = await FreightRequest.findById(req.params.id).populate("customer", "fullname email");
    if (!request)
        return next(new AppError("Freight request not found", 404));
    if (request.customer.toString() !== req.user?._id.toString())
        return next(new AppError("You are not allowed to respond to this counter", 403));
    if (request.status !== "countered")
        return next(new AppError("No counter offer to respond to", 400));
    if (decision === "accept")
        request.status = "accepted";
    else if (decision === "reject")
        request.status = "rejected";
    else
        return next(new AppError("Invalid decision", 400));
    request.customerDecisionAt = new Date();
    const customer = request.customer;
    const { error } = await sendAdminCustomerDecisionNotification(["freightaffords@gmail.com", "devfranklinandrew@gmail.com"], req.user.fullname, decision);
    if (error)
        return next(new AppError("Unable to send response to counter offer request notification.", 400));
    const booking = await Booking.create({
        bookingNumber: generateBookingNumber(),
        freightRequest: request._id,
        customer: request.customer,
        customerName: customer.fullname,
        customerEmail: customer.email,
    });
    request.booking = booking._id;
    await request.save();
    res.status(200).json({
        status: "success",
        message: "Response submitted successfully. Go to Bookings to see details.",
        data: request,
    });
};
export const getFreightRequest = async (req, res, next) => {
    const { id } = req.params;
    const request = await FreightRequest.findById(id).populate("customer", "fullname companyName");
    if (!request)
        return next(new AppError("Freight Request not found", 404));
    if (req.user.role === "customer" &&
        request.customer._id.toString() !== req.user._id.toString())
        return next(new AppError("You are not authorized to access this request", 403));
    res.status(200).json({ status: "success", data: request });
};
//# sourceMappingURL=freight.controller.js.map