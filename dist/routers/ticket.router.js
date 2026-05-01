import { Router } from "express";
import { getAllTickets, getSingleTicket, replyTicketMessage, updateTicketStatus, } from "../controllers/ticket.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
import { upload } from "../middlewares/multer.js";
import catchAsync from "../utils/catch-async.js";
const ticketRouter = Router();
ticketRouter.post("/:ticketId/reply", authenticate, authorize("admin", "cso"), upload.array("files", 5), catchAsync(replyTicketMessage));
ticketRouter.get("/", authenticate, authorize("admin", "cso"), catchAsync(getAllTickets));
ticketRouter.get("/:ticketId", authenticate, authorize("admin", "cso"), catchAsync(getSingleTicket));
ticketRouter.patch("/:ticketId/status", authenticate, authorize("admin", "cso"), catchAsync(updateTicketStatus));
export default ticketRouter;
//# sourceMappingURL=ticket.router.js.map