import AppError from "../errors/app.error.js";
import Booking from "../models/booking.model.js";
import TrackingEvent from "../models/tracking.model.js";
export const createTrackingEvent = async ({ bookingId, event, description, location, userId, }) => {
    const lastEvent = await TrackingEvent.findOne({ booking: bookingId }).sort({
        eventDate: -1,
    });
    if (lastEvent?.event === event) {
        throw new Error("Duplicate tracking event");
    }
    const trackingEvent = await TrackingEvent.create({
        booking: bookingId,
        event,
        description,
        location,
        createdBy: userId,
    });
    if (event)
        await Booking.findByIdAndUpdate(bookingId, { status: event });
    return trackingEvent;
};
export const getBookingTrackingEvents = async (req, res, next) => {
    const bookingId = req.params.id;
    const booking = await Booking.findOne({
        _id: bookingId,
        customer: req.user._id,
    });
    if (!booking)
        return next(new AppError("Booking not found or access denied.", 404));
    const events = await TrackingEvent.find({ booking: bookingId })
        .sort({
        eventDate: 1,
    })
        .populate("createdBy", "fullname companyName email");
    res
        .status(200)
        .json({ status: "success", results: events.length, data: events });
};
export const getBookingTracking = async (req, res, next) => {
    const { bookingId } = req.params;
    const events = await TrackingEvent.find({ booking: bookingId }).sort({
        eventDate: 1,
    });
    res
        .status(200)
        .json({ status: "success", results: events.length, data: events });
};
// ADMIN: Delete Tracking Event
export const deleteTrackingEvent = async (req, res, next) => {
    const event = await TrackingEvent.findByIdAndDelete(req.params.id);
    if (!event)
        return next(new AppError("Tracking event not found", 404));
    res
        .status(200)
        .json({ status: "success", message: "Tracking event removed" });
};
//# sourceMappingURL=tracking.controller.js.map