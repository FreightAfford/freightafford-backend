import { Router } from "express";
import { getActivePorts, getPortSchedule, getRoutes, } from "../controllers/schedule.controller.js";
import { authenticate } from "../middlewares/auth/protection.js";
import { scheduleRateLimiter } from "../middlewares/rate.limiter.js";
import catchAsync from "../utils/catch-async.js";
const scheduleRouter = Router();
scheduleRouter.use(authenticate);
scheduleRouter.use(scheduleRateLimiter);
scheduleRouter.get("/active-ports", catchAsync(getActivePorts));
scheduleRouter.get("/ports", catchAsync(getPortSchedule));
scheduleRouter.get("/routes", catchAsync(getRoutes));
export default scheduleRouter;
//# sourceMappingURL=schedule.router.js.map