import { Router } from "express";
import { searchCommodities } from "../controllers/commodity.controller.js";
import { authenticate } from "../middlewares/auth/protection.js";
import { commodityRateLimiter } from "../middlewares/rate.limiter.js";
import catchAsync from "../utils/catch-async.js";

const commodityRouter = Router();

commodityRouter.use(authenticate);

commodityRouter.get("/", commodityRateLimiter, catchAsync(searchCommodities));

export default commodityRouter;
