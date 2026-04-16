import { Router } from "express";
import { getAllInvoices, getInvoiceByBooking, getInvoiceByCustomer, submitPaymentProof, uploadInvoice, verifyPayment, } from "../controllers/invoice.controller.js";
import { authenticate, authorize } from "../middlewares/auth/protection.js";
import { upload } from "../middlewares/multer.js";
import catchAsync from "../utils/catch.async.js";
const invoiceRouter = Router();
invoiceRouter.post("/:bookingId", authenticate, authorize("admin"), upload.single("invoice"), catchAsync(uploadInvoice));
invoiceRouter.get("/booking/:bookingId", authenticate, catchAsync(getInvoiceByBooking));
invoiceRouter.get("/customer", authenticate, catchAsync(getInvoiceByCustomer));
invoiceRouter.get("/", authenticate, authorize("admin"), catchAsync(getAllInvoices));
invoiceRouter.post("/:invoiceId/payment", authenticate, upload.single("proof"), catchAsync(submitPaymentProof));
invoiceRouter.patch("/:invoiceId/verify", authenticate, authorize("admin"), catchAsync(verifyPayment));
export default invoiceRouter;
//# sourceMappingURL=invoice.router.js.map