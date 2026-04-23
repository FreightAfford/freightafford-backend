import { Router } from "express";
import { inboundWebhook } from "../controllers/webhook.controller.js";
import catchAsync from "../utils/catch-async.js";
const webhookRouter = Router();
webhookRouter.post("/", catchAsync(inboundWebhook));
export default webhookRouter;
//# sourceMappingURL=webhook.router.js.map