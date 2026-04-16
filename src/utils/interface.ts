import type { Request } from "express";
import type { Document, Types } from "mongoose";

export type UserRole = "customer" | "admin";

export interface IUser extends Document {
  fullname: string;
  email: string;
  password: string;
  passwordChangedAt: Date;
  role: string;
  isEmailVerified: boolean;
  otp: string | undefined;
  otpExpiry: Date | undefined;
  otpAttempts: number;
  otpResendCount: number;
  acceptedTermsAt: Date;
  acceptedFreightRulesAt: Date;
  passwordResetToken: string | undefined;
  passwordResetExpiry: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
  companyName: string;
  phoneNumber: string;
  companyAddress: string;
  country: string;
  status: string;
}

export interface JwtPayload {
  userId: string;
  role: string;
}

export interface AuthenticateRequest extends Request {
  user?: IUser;
}

export interface IFreightRequest extends Document {
  customer: Types.ObjectId;
  customerName: string;
  customerEmail: string;
  booking: Types.ObjectId;
  originPort: string;
  destinationPort: string;
  commodity: string;
  cargoWeight: number;
  cargoReadyDate: Date;
  proposedPrice: number;
  notes?: string;
  adminCounterPrice?: number;
  counterReason?: string;
  rejectionReason?: string;
  status: "pending" | "countered" | "accepted" | "rejected" | "expired";
  containerSize: "20FT" | "40FT" | "40FT_HC";
  containerQuantity: number;
  adminActionAt?: Date;
  customerDecisionAt?: Date;
}

export interface IBooking extends Document {
  bookingNumber: string;
  carrierBookingNumber: string;
  freightRequest: Types.ObjectId;
  customer: Types.ObjectId;
  customerName: string;
  customerEmail: string;
  shippingLine: string;
  vessel: string;
  sailingDate: Date;
  status: string;
  containers: string[];
}

export interface ITrackingEvent extends Document {
  booking: Types.ObjectId;
  location: { originPort: string; destinationPort: string };
  event: string;
  description?: string;
  eventDate: Date;
  createdBy: Types.ObjectId;
}

export interface IInvoice extends Document {
  invoiceNumber: string;
  booking: Types.ObjectId;
  bookingNumber: string;
  customer: Types.ObjectId;
  customerName: string;
  customerEmail: string;
  uploadedBy: Types.ObjectId;
  documentUrl: string;
  documentPublicId: string;
  fileSize: number;
  status: string;
  dueDate: Date;
  paidAt: Date;
  paymentReference: string;
  paymentProofUrl: string;
  paymentProofPublicId: string;
  verifiedBy: Types.ObjectId;
  createdAt: Date;
  amount: number;
  description: string;
}
