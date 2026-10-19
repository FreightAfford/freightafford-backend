import { Router } from "express";
import {
  getActivePorts,
  getActiveVessels,
  getPortSchedule,
  getRoutes,
  getVesselSchedule,
} from "../controllers/schedule.controller.js";
import { authenticate } from "../middlewares/auth/protection.js";
import { requireVerifiedForSchedules } from "../middlewares/kyc.js";
import { scheduleRateLimiter } from "../middlewares/rate.limiter.js";
import catchAsync from "../utils/catch-async.js";

const scheduleRouter = Router();

scheduleRouter.use(authenticate);
// Customers need a verified business; staff always get through
scheduleRouter.use(catchAsync(requireVerifiedForSchedules));
scheduleRouter.use(scheduleRateLimiter);

scheduleRouter.get("/active-ports", catchAsync(getActivePorts));
scheduleRouter.get("/ports", catchAsync(getPortSchedule));
scheduleRouter.get("/routes", catchAsync(getRoutes));
scheduleRouter.get("/active-vessels", catchAsync(getActiveVessels));
scheduleRouter.get("/vessels", catchAsync(getVesselSchedule));

export default scheduleRouter;
