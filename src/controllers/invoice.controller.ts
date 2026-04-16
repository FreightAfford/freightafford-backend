import type { NextFunction, Response } from "express";
import AppError from "../errors/app.error.js";
import Booking from "../models/booking.model.js";
import Invoice from "../models/invoice.model.js";
import {
  sendSubmitPaymentProofNotification,
  sendUploadInvoiceNotification,
  sendVerifyPaymentNotification,
} from "../services/invoice.services.js";
import type {
  AuthenticateRequest,
  IFreightRequest,
  IUser,
} from "../utils/interface.js";
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";

export const generateInvoiceNumber = async () => {
  const count = await Invoice.countDocuments();

  const number = String(count + 1).padStart(5, "0");

  return `INV-${new Date().getFullYear()}-${number}`;
};

export const uploadInvoice = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const adminId = req.user!._id;
  const { bookingId } = req.params;
  const { dueDate, description } = req.body;

  if (!req.file) return next(new AppError("Invoice file is required", 400));

  if (req.file.mimetype !== "application/pdf")
    return next(new AppError("Only PDF invoices are allowed", 400));

  const booking = await Booking.findById(bookingId)
    .populate("customer")
    .populate("freightRequest", "proposedPrice adminCounterPrice");

  if (!booking) return next(new AppError("Booking not found", 404));

  if (
    !["confirmed", "in_transit", "arrived", "delivered"].includes(
      booking.status,
    )
  )
    return next(
      new AppError("Invoice can only be uploaded for confirmed bookings", 400),
    );

  const existingInvoice = await Invoice.findOne({ booking: bookingId! });

  if (existingInvoice)
    return next(new AppError("Invoice already exists for this booking", 400));

  const uploaded: any = await uploadToCloudinary(req.file, "invoices");

  if (!uploaded) return next(new AppError("File upload failed", 500));

  const freightRequest = booking.freightRequest as unknown as IFreightRequest;
  const customer = booking.customer as unknown as IUser;

  const invoice = new Invoice({
    invoiceNumber: await generateInvoiceNumber(),
    booking: booking._id,
    bookingNumber: booking.bookingNumber,
    customer: booking.customer._id,
    customerName: customer.fullname,
    customerEmail: customer.email,
    uploadedBy: adminId,
    documentUrl: uploaded.secure_url,
    documentPublicId: uploaded.public_id,
    fileSize: uploaded.bytes,
    dueDate,
    amount: freightRequest.adminCounterPrice || freightRequest.proposedPrice,
    description,
  });

  const { error } = await sendUploadInvoiceNotification(
    customer.email,
    customer.fullname,
    invoice.invoiceNumber,
    invoice.amount,
    invoice.dueDate,
  );

  if (error)
    return next(new AppError("Unable to send invoice notification", 400));

  await invoice.save();
  return res.status(200).json({
    status: "success",
    message: "Invoice uploaded successfully",
    data: invoice,
  });
};

export const getInvoiceByBooking = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  // const userId = req.user!._id;
  const { bookingId } = req.params;

  const booking = await Booking.findById(bookingId);

  if (!booking) return next(new AppError("Booking not found", 404));

  // if (booking.customer.toString() !== userId.toString())
  //   return next(new AppError("Unauthorized access to this booking", 403));

  const invoice = await Invoice.findOne({ booking: bookingId! })
    .populate("booking", "bookingNumber shippingLine status")
    .populate("customer", "companyName fullname email country");

  if (!invoice)
    return next(new AppError("Invoice not found for this booking", 404));

  res.status(200).json({
    status: "success",
    data: invoice,
  });
};

export const getInvoiceByCustomer = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.user!._id;

  const invoices = await Invoice.find({ customer: userId })
    .populate("customer", "companyName fullname")
    .populate("booking", "bookingNumber")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    status: "success",
    results: invoices.length,
    data: invoices,
  });
};

export const getAllInvoices = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const invoices = await Invoice.find()
    .populate("customer", "fullname companyName")
    .populate("booking", "bookingNumber")
    .sort({ createdAt: -1 });

  res
    .status(200)
    .json({ status: "success", results: invoices.length, data: invoices });
};

export const submitPaymentProof = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.user!._id;
  const { invoiceId } = req.params;
  const { paymentReference } = req.body;

  const invoice = await Invoice.findById(invoiceId);

  if (!invoice) return next(new AppError("Invoice not found", 404));

  if (invoice.customer.toString() !== userId.toString())
    return next(new AppError("Unauthorized to access this invoice", 403));

  if (invoice.status !== "pending")
    return next(
      new AppError("Payment already submitted or invoice not payable", 400),
    );

  if (!paymentReference)
    return next(new AppError("Payment reference is required", 400));

  let proofUpload: any;

  if (req.file)
    proofUpload = await uploadToCloudinary(req.file, "payment_proofs");

  invoice.paymentReference = paymentReference;
  invoice.status = "awaiting_verification";

  if (proofUpload) {
    invoice.paymentProofUrl = proofUpload.secure_url;
    invoice.paymentProofPublicId = proofUpload.public_id;
  }

  const { error } = await sendSubmitPaymentProofNotification(
    ["freightaffords@gmail.com", "devfranklinandrew@gmail.com"],
    invoice.invoiceNumber,
    invoice.paymentReference,
    invoice.status,
  );

  if (error)
    return next(new AppError("Unable to send payment proof notification", 400));

  await invoice.save();

  return res.status(200).json({
    status: "success",
    message: "Payment submitted successfully. Awaiting verification.",
  });
};

export const verifyPayment = async (
  req: AuthenticateRequest,
  res: Response,
  next: NextFunction,
) => {
  const adminId = req.user!._id;
  const { invoiceId } = req.params;
  const { action } = req.body;

  const invoice = await Invoice.findById(invoiceId).populate("customer");

  if (!invoice) return next(new AppError("Invoice not found", 404));

  if (invoice.status !== "awaiting_verification")
    return next(new AppError("Invoice is not awaiting verification", 400));

  if (!["approve", "reject"].includes(action))
    return next(new AppError("Invalid action", 400));

  if (action === "approve") {
    invoice.status = "paid";
    invoice.paidAt = new Date();
    invoice.verifiedBy = adminId;
  }

  if (action === "reject") {
    invoice.status = "rejected";
    invoice.verifiedBy = adminId;
  }

  const customer = invoice.customer as unknown as IUser;

  const { error } = await sendVerifyPaymentNotification(
    customer.email,
    customer.fullname,
    action,
    invoice.invoiceNumber,
    invoice.status,
  );

  if (error)
    return next(
      new AppError("Unable to send verify payment notification", 400),
    );

  await invoice.save();
  res.status(200).json({
    status: "success",
    message:
      action === "approve"
        ? "Payment verified successfully"
        : "Payment rejected",
    data: invoice,
  });
};
