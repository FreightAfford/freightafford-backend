import AppError from "../errors/app.error.js";
import Booking from "../models/booking.model.js";
import { sendBookingScheduleNotification, sendContainerNumbersNotification, sendShipmentStatusUpdate, } from "../services/booking.services.js";
import ApiFeatures from "../utils/api.features.js";
import { canModifyContainers, isValidContainer, normalizeContainers, validateContainers, } from "../utils/container.js";
import { allowedBookingFilters } from "../utils/whitelists.js";
import { createTrackingEvent } from "./tracking.controller.js";
export const getMyBookings = async (req, res, next) => {
    const baseFilter = { customer: req.user._id };
    const totalAll = await Booking.countDocuments(baseFilter);
    const countFeatures = new ApiFeatures(Booking.find(baseFilter), req.query)
        .filter(allowedBookingFilters)
        .search(["bookingNumber", "shippingLine", "status"]);
    const total = await countFeatures.query.countDocuments();
    const baseQuery = Booking.find(baseFilter).populate("freightRequest", "status commodity");
    const features = new ApiFeatures(baseQuery, req.query)
        .filter(allowedBookingFilters)
        .search(["bookingNumber", "shippingLine", "status"])
        .sort()
        .limitFields()
        .paginate();
    const bookings = await features.query;
    res.status(200).json({
        status: "success",
        results: bookings.length,
        total,
        totalAll,
        page: Number(req.query.page || 1),
        data: bookings,
    });
};
// ADMIN: Get All Bookings
export const getAllBookings = async (req, res, next) => {
    const baseFilter = {};
    const totalAll = await Booking.countDocuments(baseFilter);
    const countFeatures = new ApiFeatures(Booking.find(baseFilter), req.query)
        .filter(allowedBookingFilters)
        .search([
        "bookingNumber",
        "shippingLine",
        "status",
        "customerName",
        "customerEmail",
    ]);
    const total = await countFeatures.query.countDocuments();
    const baseQuery = Booking.find(baseFilter).populate("freightRequest", "status commodity");
    const features = new ApiFeatures(baseQuery, req.query)
        .filter(allowedBookingFilters)
        .search([
        "bookingNumber",
        "shippingLine",
        "status",
        "customerName",
        "customerEmail",
    ])
        .sort()
        .limitFields()
        .paginate();
    const bookings = await features.query;
    res.status(200).json({
        status: "success",
        results: bookings.length,
        total,
        totalAll,
        page: Number(req.query.page) || 1,
        data: bookings,
    });
};
export const getSingleBooking = async (req, res, next) => {
    const booking = await Booking.findById(req.params.id)
        .populate("customer", "fullname email companyName")
        .populate("freightRequest");
    if (!booking)
        return next(new AppError("Booking not found", 404));
    res.status(200).json({ status: "success", data: booking });
};
// ADMIN: Update Shipping Details
export const updateBookingShipping = async (req, res, next) => {
    const { shippingLine, vessel, sailingDate, carrierBookingNumber } = req.body;
    const booking = await Booking.findById(req.params.id).populate("customer", "email fullname");
    if (!booking)
        return next(new AppError("Booking not found", 404));
    const customer = booking.customer;
    booking.shippingLine = shippingLine;
    booking.vessel = vessel;
    booking.sailingDate = sailingDate;
    booking.carrierBookingNumber = carrierBookingNumber;
    const { error } = await sendBookingScheduleNotification(customer.email, customer.fullname, carrierBookingNumber, shippingLine, vessel, booking.sailingDate);
    if (error)
        return next(new AppError("Unable to send booking schedule notification", 400));
    await booking.save();
    res.status(200).json({
        status: "success",
        message: "Booking details updated sent to client.",
        data: booking,
    });
};
// ADMIN: Update Booking Status
export const updateBookingStatus = async (req, res, next) => {
    const { status } = req.body;
    const booking = await Booking.findById(req.params.id)
        .populate("customer", "email fullname")
        .populate("freightRequest", "originPort destinationPort");
    if (!booking)
        return next(new AppError("Booking not found", 404));
    const allowedTransitions = {
        awaiting_confirmation: ["confirmed", "cancelled"],
        confirmed: ["in_transit", "cancelled"],
        in_transit: ["arrived", "cancelled"],
        arrived: ["delivered", "cancelled"],
        delivered: [],
        cancelled: [],
    };
    const currentStatus = booking.status;
    const validNextStatuses = allowedTransitions[currentStatus];
    if (!validNextStatuses?.includes(status))
        return next(new AppError(`Invalid status transition from "${currentStatus}" to "${status}"`, 400));
    const request = booking.freightRequest;
    const customer = booking.customer;
    const { error } = await sendShipmentStatusUpdate(customer.email, customer.fullname, booking.bookingNumber, status);
    if (error)
        return next(new AppError("Booking status Notification email failed", 400));
    await createTrackingEvent({
        bookingId: booking._id.toString(),
        event: status,
        description: `Shipment status updated to ${status}`,
        location: {
            originPort: request.originPort,
            destinationPort: request.destinationPort,
        },
        userId: req.user._id.toString(),
    });
    res.status(200).json({
        status: "success",
        message: "Booking status updated",
        data: booking,
    });
};
export const addContainers = async (req, res, next) => {
    const { bookingId } = req.params;
    let { containers } = req.body;
    if (!Array.isArray(containers) || containers.length === 0)
        return next(new AppError("Containers are required", 400));
    containers = normalizeContainers(containers);
    if (isValidContainer(containers))
        return next(new AppError("Invalid container format", 400));
    const booking = await Booking.findById(bookingId);
    if (!booking)
        return next(new AppError("Booking not found", 404));
    if (!canModifyContainers(booking.status))
        return next(new AppError(`Cannot modify containers when booking is '${booking.status}'`, 403));
    const existing = booking.containers || [];
    const merged = normalizeContainers([...existing, ...containers]);
    booking.containers = merged;
    await booking.save();
    res.status(200).json({
        status: "success",
        message: "Containers added successfully",
        containers: booking.containers,
    });
};
export const removeContainers = async (req, res, next) => {
    const { bookingId } = req.params;
    let { containers } = req.body;
    if (!Array.isArray(containers) || containers.length === 0)
        return next(new AppError("Containers are required", 400));
    containers = normalizeContainers(containers);
    const booking = await Booking.findById(bookingId);
    if (!booking)
        return next(new AppError("Booking not found", 404));
    if (!canModifyContainers(booking.status))
        return next(new AppError(`Cannot modify containers when booking is '${booking.status}'`, 403));
    booking.containers = (booking.containers || []).filter((c) => !containers.includes(c));
    await booking.save();
    res.status(200).json({
        status: "success",
        message: "Containers removed successfully",
        containers: booking.containers,
    });
};
export const replaceContainers = async (req, res, next) => {
    const { bookingId } = req.params;
    let { containers } = req.body;
    if (!Array.isArray(containers) || containers.length === 0)
        return next(new AppError("Containers are required", 400));
    containers = normalizeContainers(containers);
    if (!validateContainers(containers))
        return next(new AppError("Invalid container format", 400));
    const booking = await Booking.findById(bookingId)
        .populate("customer", "fullname email")
        .populate("freightRequest", "originPort destinationPort");
    if (!booking)
        return next(new AppError("Booking not found", 404));
    if (!canModifyContainers(booking.status)) {
        return res.status(403).json({
            message: `Cannot modify containers when booking is '${booking.status.replace("_", " ").toUpperCase()}'`,
        });
    }
    booking.containers = containers;
    const customer = booking.customer;
    const request = booking.freightRequest;
    const { error } = await sendContainerNumbersNotification(customer.email, customer.fullname, booking.bookingNumber, request.originPort, request.destinationPort, booking.containers);
    if (error)
        return next(new AppError("Unable to update container manifest. Try again.", 400));
    await booking.save();
    res.status(200).json({
        status: "success",
        message: "Containers updated successfully",
        containers: booking.containers,
    });
};
//# sourceMappingURL=booking.controller.js.map