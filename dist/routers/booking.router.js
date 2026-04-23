import { Router } from "express";
import { addContainers, getAllBookings, getMyBookings, getSingleBooking, removeContainers, replaceContainers, updateBookingShipping, updateBookingStatus, } from "../controllers/booking.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
import catchAsync from "../utils/catch-async.js";
const bookingRouter = Router();
bookingRouter.use(authenticate);
bookingRouter.get("/me", catchAsync(getMyBookings));
bookingRouter.get("/:id/single", catchAsync(getSingleBooking));
bookingRouter.use(authorize("admin", "cso"));
bookingRouter.get("/admin", catchAsync(getAllBookings));
bookingRouter.patch("/admin/:id/shipping", catchAsync(updateBookingShipping));
bookingRouter.patch("/admin/:id/status", catchAsync(updateBookingStatus));
bookingRouter.post("/:bookingId/containers/add", catchAsync(addContainers));
bookingRouter.post("/:bookingId/containers/remove", catchAsync(removeContainers));
bookingRouter.put("/:bookingId/containers/replace", catchAsync(replaceContainers));
export default bookingRouter;
//# sourceMappingURL=booking.router.js.map