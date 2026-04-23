import { Router } from "express";
import { replyTicketMessage } from "../controllers/ticket.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
import { upload } from "../middlewares/multer.js";

const ticketRouter = Router();

ticketRouter.post(
  "/:ticketId/reply",
  authenticate,
  authorize("admin", "cso"),
  upload.array("files", 5),
  replyTicketMessage,
);

export default ticketRouter;
