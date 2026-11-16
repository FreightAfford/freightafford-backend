import { Schema, model } from "mongoose";
import {
  RATE_CONTAINER_SIZES,
  type IFreeTime,
  type IFreeTimeTier,
  type IRate,
  type IRateCharge,
  type IRatePort,
} from "../utils/interface.js";

// A Maersk contract rate for one lane, container size and commodity, valid
// between two dates (both inclusive). Customers see it while it's valid;
// its status (scheduled, active, expiring, expired) is worked out from the
// dates, never stored.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UN_LOCODE = /^[A-Z]{2}[A-Z2-9]{3}$/;
const CURRENCY = /^[A-Z]{3}$/;

export const portSchema = new Schema<IRatePort>(
  {
    code: { type: String, required: true, uppercase: true, match: UN_LOCODE },
    city: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const chargeSchema = new Schema<IRateCharge>(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, match: CURRENCY },
    basis: { type: String, enum: ["container", "document"], required: true },
    stage: {
      type: String,
      enum: ["freight", "origin", "destination"],
      required: true,
    },
    payTerm: {
      type: String,
      enum: ["prepaid", "collect", "either"],
      required: true,
    },
    structure: { type: String, enum: ["fixed", "floating"], required: true },
  },
  { _id: false },
);

const tierSchema = new Schema<IFreeTimeTier>(
  {
    fromDay: { type: Number, required: true, min: 1 },
    toDay: { type: Number, min: 1 },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, match: CURRENCY },
  },
  { _id: false },
);

const freeTimeSchema = new Schema<IFreeTime>(
  {
    type: { type: String, required: true, trim: true },
    days: { type: Number, required: true, min: 0 },
    dayType: { type: String, required: true, trim: true },
    startEvent: { type: String, required: true, trim: true },
    endEvent: { type: String, required: true, trim: true },
    tiers: { type: [tierSchema], default: [] },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const rateSchema = new Schema<IRate>(
  {
    origin: { type: portSchema, required: true },
    destination: { type: portSchema, required: true },
    containerSize: {
      type: String,
      enum: RATE_CONTAINER_SIZES,
      required: true,
    },
    validFrom: { type: String, required: true, match: ISO_DATE },
    validTo: { type: String, required: true, match: ISO_DATE },
    commodity: { type: String, required: true, trim: true },
    commodityCode: { type: String, trim: true, match: /^\d{6}$/ },
    serviceMode: { type: String, trim: true },
    transitHours: { type: Number, min: 0 },
    remarks: { type: String, trim: true },
    charges: {
      type: [chargeSchema],
      validate: {
        validator: (charges: IRateCharge[]) => charges.length > 0,
        message: "A rate needs at least one charge",
      },
    },
    freeTime: { type: [freeTimeSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedByName: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

// Customer search: a destination (and maybe an origin) valid today.
rateSchema.index({
  "destination.code": 1,
  "origin.code": 1,
  validFrom: 1,
  validTo: 1,
});
// Finding the rate an import or a save replaces or overlaps.
rateSchema.index({
  "origin.code": 1,
  "destination.code": 1,
  containerSize: 1,
  commodityCode: 1,
});
// Admin list, newest change first.
rateSchema.index({ updatedAt: -1 });

const Rate = model<IRate>("Rate", rateSchema);

export default Rate;
