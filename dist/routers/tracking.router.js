import { Router } from "express";
import { deleteTrackingEvent, getBookingTracking, getBookingTrackingEvents, } from "../controllers/tracking.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
import catchAsync from "../utils/catch-async.js";
const trackingRouter = Router();
trackingRouter.use(authenticate);
trackingRouter.get("/bookings/:bookingId", catchAsync(getBookingTracking));
trackingRouter.get("/bookings/:id", catchAsync(getBookingTrackingEvents));
// trackingRouter.post(
//   "/admin/bookings/:bookingId",
//   authorize("admin"),
//   catchAsync(createTrackingEvent),
// );
trackingRouter.delete("/admin/:id", authorize("admin"), catchAsync(deleteTrackingEvent));
export default trackingRouter;
//# sourceMappingURL=tracking.router.js.map