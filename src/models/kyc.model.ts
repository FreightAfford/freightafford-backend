import { model, Schema } from "mongoose";
import type { IKyc } from "../utils/interface.js";

// Business verification (KYC), one per customer account. Exporters and
// export agents go through the same checks.
//
// Every uploaded file is kept in `uploads`; the fields that need a document
// (CAC certificate, director ID, letter of authority, ...) hold the id of an
// entry there. Files live in Cloudinary as private ("authenticated") assets
// and are only reachable through short-lived links made on request.

export const KYC_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
] as const;

export const KYC_HISTORY_ACTIONS = [
  "submitted",
  "review_started",
  "approved",
  "changes_requested",
  "rejected",
] as const;

const documentRef = { type: Schema.Types.ObjectId, default: null };

const uploadSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 255 },
    size: { type: Number, required: true, min: 0 },
    mimeType: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, required: true },
    format: { type: String },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const directorSchema = new Schema(
  {
    fullName: { type: String, trim: true, default: "" },
    role: { type: String, trim: true, default: "" },
    idType: {
      type: String,
      enum: ["nin", "passport", "drivers_licence"],
      default: "nin",
    },
    // AES-256-GCM via utils/encryption; never stored in plain text.
    idNumberEncrypted: { type: String, default: "" },
    idExpiry: { type: Date, default: null },
    idDocument: documentRef,
  },
  { _id: true },
);

const kycSchema = new Schema<IKyc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    accountType: {
      type: String,
      enum: ["export_agent", "exporter"],
      default: "export_agent",
    },
    status: {
      type: String,
      enum: KYC_STATUSES,
      default: "draft",
      index: true,
    },
    business: {
      legalName: { type: String, trim: true, default: "" },
      cacType: { type: String, enum: ["RC", "BN"], default: "RC" },
      // Digits only; the RC/BN prefix is in cacType.
      cacNumber: { type: String, trim: true, default: "", index: true },
      cacCertificate: documentRef,
      tin: { type: String, trim: true, default: "" },
      tinCertificate: documentRef,
      nepcNumber: { type: String, trim: true, default: "" },
      nepcExpiry: { type: Date, default: null },
      nepcCertificate: documentRef,
      address: {
        street: { type: String, trim: true, default: "" },
        city: { type: String, trim: true, default: "" },
        state: { type: String, trim: true, default: "" },
        proofOfAddress: documentRef,
      },
    },
    directors: { type: [directorSchema], default: [] },
    // The company's own letter, signed by a director, allowing the account
    // holder to book shipments for it.
    authorisation: {
      letter: documentRef,
      signedBy: { type: String, trim: true, default: "" },
      issuedOn: { type: Date, default: null },
    },
    uploads: { type: [uploadSchema], default: [] },
    // Reviewer notes per field, e.g. { path: "business.tin", note: "..." }.
    // A list rather than a Map: Mongo map keys can't contain dots.
    reviewNotes: {
      type: [
        {
          path: { type: String, required: true },
          note: { type: String, required: true, trim: true, maxlength: 1000 },
        },
      ],
      default: [],
      _id: false,
    },
    rejectionReason: { type: String, trim: true },
    declarationAcceptedAt: { type: Date },
    submittedAt: { type: Date, index: true },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    history: {
      type: [
        {
          action: { type: String, enum: KYC_HISTORY_ACTIONS, required: true },
          by: { type: Schema.Types.ObjectId, ref: "User", required: true },
          at: { type: Date, default: Date.now },
          note: { type: String, trim: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

const Kyc = model<IKyc>("Kyc", kycSchema);
export default Kyc;
