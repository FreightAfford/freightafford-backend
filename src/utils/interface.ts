import type { Request } from "express";
import type { Document, Types } from "mongoose";
import { Socket } from "socket.io";

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
  accountType: KycAccountType;
}

export type KycAccountType = "export_agent" | "exporter";

export type KycStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "rejected";

export interface IKycUpload {
  _id: Types.ObjectId;
  name: string;
  size: number;
  mimeType: string;
  publicId: string;
  resourceType: string;
  format?: string;
  uploadedAt: Date;
}

export interface IKycDirector {
  _id: Types.ObjectId;
  fullName: string;
  role: string;
  idType: "nin" | "passport" | "drivers_licence";
  // Encrypted with utils/encryption; decrypt only for owner and staff.
  idNumberEncrypted: string;
  idExpiry: Date | null;
  idDocument: Types.ObjectId | null;
}

export interface IKycHistoryEntry {
  action:
    | "submitted"
    | "review_started"
    | "approved"
    | "changes_requested"
    | "rejected";
  by: Types.ObjectId;
  at: Date;
  note?: string;
}

export interface IKyc extends Document {
  user: Types.ObjectId;
  accountType: KycAccountType;
  status: KycStatus;
  business: {
    legalName: string;
    cacType: "RC" | "BN";
    cacNumber: string;
    cacCertificate: Types.ObjectId | null;
    tin: string;
    tinCertificate: Types.ObjectId | null;
    nepcNumber: string;
    nepcExpiry: Date | null;
    nepcCertificate: Types.ObjectId | null;
    address: {
      street: string;
      city: string;
      state: string;
      proofOfAddress: Types.ObjectId | null;
    };
  };
  directors: IKycDirector[];
  authorisation: {
    letter: Types.ObjectId | null;
    signedBy: string;
    issuedOn: Date | null;
  };
  uploads: IKycUpload[];
  reviewNotes: { path: string; note: string }[];
  rejectionReason?: string;
  declarationAcceptedAt?: Date;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: Types.ObjectId;
  history: IKycHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export interface JwtPayload {
  userId: string;
  role: string;
}

export interface AuthenticateRequest extends Request {
  user?: IUser;
}

export interface AuthenticatedSocket extends Socket {
  user?: IUser;
}

export interface IFreightRequest extends Document {
  customer: Types.ObjectId;
  customerName: string;
  customerEmail: string;
  booking: Types.ObjectId;
  originPort: string;
  destinationPort: string;
  originPortCode?: string;
  destinationPortCode?: string;
  commodity: string;
  commodityCode?: string;
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
  batchId?: string | null;
  batchSize?: number;
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
  vesselImo?: string;
  sailingDate: Date;
  eta?: Date;
  maerskSync?: {
    status?: "ok" | "not_found" | "error";
    lastSyncedAt?: Date;
    reference?: string;
    departedAt?: Date;
    arrivedAt?: Date;
  };
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
