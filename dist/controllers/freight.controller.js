import AppError from "../errors/app.error.js";
import Booking from "../models/booking.model.js";
import FreightRequest from "../models/freight.model.js";
import User from "../models/user.model.js";
import { sendAdminCustomerDecisionNotification, sendAdminFreightRequestNotification, sendCustomerAcceptedNotification, sendCustomerBatchAcceptedNotification, sendCustomerCounterNotification, sendCustomerRejectedNotification, } from "../services/freight.service.js";
import ApiFeatures from "../utils/api-features.js";
import { allowedFreightFilters } from "../utils/whitelists.js";
const generateBookingNumber = () => {
    const random = Math.floor(100000 + Math.random() * 900000);
    return `FA-${new Date().getFullYear()}-${random}`;
};
// CUSTOMER: Create Request
export const createFreightRequest = async (req, res, next) => {
    const { originPort, destinationPort, commodity, cargoReadyDate, cargoWeight, proposedPrice, notes, containerSize, containerQuantity, quantity, } = req.body;
    const requestCount = Math.min(Math.max(Number(quantity) || 1, 1), 50);
    const batchId = requestCount > 1 ? `batch_${Date.now()}` : null;
    const baseDoc = {
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
        batchId,
        batchSize: requestCount > 1 ? requestCount : undefined,
    };
    const docsToInsert = Array.from({ length: requestCount }, () => baseDoc);
    const createdRequests = await FreightRequest.insertMany(docsToInsert);
    const { error } = await sendAdminFreightRequestNotification({
        originPort,
        destinationPort,
        cargoWeight,
        proposedPrice,
        commodity,
        quantity: requestCount,
        batchId,
    });
    if (error) {
        // return next(
        //   new AppError("Unable to send freight request notification", 400),
        // );
        // Requests are already created — don't fail the customer's request over an email issue.
        console.error("Failed to send admin freight request notification:", error);
    }
    res.status(201).json({
        status: "success",
        message: requestCount > 1
            ? `${requestCount} freight requests sent successfully.`
            : "Freight request sent successfully.",
        data: requestCount > 1 ? createdRequests : createdRequests[0],
    });
};
// ADMIN & CSO: Update Request
export const updateFreightRequest = async (req, res, next) => {
    const { requestId } = req.params;
    const { originPort, destinationPort, commodity, cargoReadyDate, cargoWeight, proposedPrice, notes, containerSize, containerQuantity, status, adminCounterPrice, counterReason, rejectionReason, } = req.body;
    const request = await FreightRequest.findById(requestId);
    if (!request)
        return next(new AppError("Freight request not found", 404));
    if (["accepted", "rejected", "expired"].includes(request.status))
        return next(new AppError("Cannot update a finalized freight request", 400));
    const updatedData = {};
    if (originPort)
        updatedData.originPort = originPort.toLowerCase();
    if (destinationPort)
        updatedData.destinationPort = destinationPort.toLowerCase();
    if (commodity)
        updatedData.commodity = commodity.toLowerCase();
    if (cargoReadyDate)
        updatedData.cargoReadyDate = cargoReadyDate;
    if (cargoWeight)
        updatedData.cargoWeight = cargoWeight;
    if (proposedPrice)
        updatedData.proposedPrice = proposedPrice;
    if (notes !== undefined)
        updatedData.notes = notes;
    if (containerSize)
        updatedData.containerSize = containerSize;
    if (containerQuantity)
        updatedData.containerQuantity = containerQuantity;
    if (status) {
        updatedData.status = status;
        if (status === "countered") {
            if (!adminCounterPrice || !counterReason)
                return next(new AppError("Counter price and reason are required for counter offers", 400));
            updatedData.adminCounterPrice = adminCounterPrice;
            updatedData.counterReason = counterReason;
            updatedData.adminActionAt = new Date();
        }
        if (status === "rejected") {
            if (!rejectionReason)
                return next(new AppError("Rejection reason is required", 400));
            updatedData.rejectionReason = rejectionReason;
            updatedData.adminActionAt = new Date();
        }
        if (status === "accepted")
            updatedData.adminActionAt = new Date();
    }
    const updatedRequest = await FreightRequest.findByIdAndUpdate(requestId, updatedData, { new: true, runValidators: true });
    res.status(200).json({
        status: "success",
        message: "Freight request updated successfully",
        data: updatedRequest,
    });
};
// ADMIN & CSO: Accept all requests in a batch at once
export const acceptFreightRequestBatch = async (req, res, next) => {
    const { batchId } = req.params;
    if (!batchId) {
        return next(new AppError("batchId is required", 400));
    }
    const batchRequests = await FreightRequest.find({ batchId });
    if (batchRequests.length === 0) {
        return next(new AppError("Batch not found", 404));
    }
    const acceptableRequests = batchRequests.filter((r) => r.status === "pending" || r.status === "countered");
    if (acceptableRequests.length === 0) {
        return next(new AppError("No acceptable requests found in this batch", 400));
    }
    const customer = await User.findById(acceptableRequests[0].customer);
    if (!customer)
        return next(new AppError("User not found.", 404));
    const createdBookings = [];
    for (const request of acceptableRequests) {
        const booking = await Booking.create({
            bookingNumber: generateBookingNumber(),
            freightRequest: request._id,
            customer: request.customer,
            customerName: customer.fullname,
            customerEmail: customer.email,
        });
        request.status = "accepted";
        request.adminActionAt = new Date();
        request.booking = booking._id;
        await request.save();
        createdBookings.push(booking);
    }
    const { error } = await sendCustomerBatchAcceptedNotification(customer.email, customer.fullname, createdBookings.map((b) => b.bookingNumber));
    if (error) {
        console.error("Batch accepted but notification email failed to send:", error);
    }
    res.status(200).json({
        status: "success",
        message: `${createdBookings.length} freight request(s) accepted and booked out of ${batchRequests.length} in this batch.`,
        acceptedCount: createdBookings.length,
        skippedCount: batchRequests.length - acceptableRequests.length,
        data: { freightRequests: acceptableRequests, bookings: createdBookings },
    });
};
export const getMyFreightRequest = async (req, res, next) => {
    const baseFilter = { customer: req.user._id };
    const totalAll = await FreightRequest.countDocuments(baseFilter);
    const countFeatures = new ApiFeatures(FreightRequest.find(baseFilter), req.query)
        .filter(allowedFreightFilters)
        .search(["originPort", "destinationPort", "commodity", "status"]);
    const total = await countFeatures.query.countDocuments();
    const baseQuery = FreightRequest.find(baseFilter).populate("customer");
    const features = new ApiFeatures(baseQuery, req.query)
        .filter(allowedFreightFilters)
        .search(["originPort", "destinationPort", "commodity", "status"])
        .sort()
        .limitFields()
        .paginate();
    const requests = await features.query;
    res.status(200).json({
        status: "success",
        results: requests.length,
        total,
        totalAll,
        page: Number(req.query.page) || 1,
        data: requests,
    });
};
export const getAllFreightRequests = async (req, res, next) => {
    const baseFilter = {};
    const totalAll = await FreightRequest.countDocuments(baseFilter);
    const countFeatures = new ApiFeatures(FreightRequest.find(baseFilter), req.query)
        .filter(allowedFreightFilters)
        .search([
        "originPort",
        "destinationPort",
        "commodity",
        "status",
        "customerName",
        "customerEmail",
        "batchId",
    ]);
    const total = await countFeatures.query.countDocuments();
    const baseQuery = FreightRequest.find(baseFilter).populate("customer", "fullname companyName");
    const features = new ApiFeatures(baseQuery, req.query)
        .filter(allowedFreightFilters)
        .search([
        "originPort",
        "destinationPort",
        "commodity",
        "status",
        "customerName",
        "customerEmail",
        "batchId",
    ])
        .sort()
        .limitFields()
        .paginate();
    const requests = await features.query;
    res.status(200).json({
        status: "success",
        results: requests.length,
        total,
        totalAll,
        page: Number(req.query.page) || 1,
        data: requests,
    });
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
    if (request.customer._id.toString() !== req.user._id.toString())
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