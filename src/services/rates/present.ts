import type { IRate, IRateRequest } from "../../utils/interface.js";

// Rates and rate requests in the shapes the frontend reads
// (frontend/src/services/api/rate.ts): internal fields left out, the editor
// as a display name, the customer as one object.

type Lean<T> = Omit<T, keyof import("mongoose").Document> & { _id: unknown };

const iso = (value?: Date | string) =>
  value ? new Date(value).toISOString() : undefined;

export const presentRate = (rate: Lean<IRate>) => ({
  _id: String(rate._id),
  origin: rate.origin,
  destination: rate.destination,
  containerSize: rate.containerSize,
  validFrom: rate.validFrom,
  validTo: rate.validTo,
  commodity: rate.commodity,
  commodityCode: rate.commodityCode || undefined,
  serviceMode: rate.serviceMode || undefined,
  transitHours: rate.transitHours ?? undefined,
  remarks: rate.remarks || undefined,
  charges: rate.charges,
  freeTime: rate.freeTime ?? [],
  updatedAt: iso(rate.updatedAt)!,
  updatedBy: rate.updatedByName,
});

export const presentRateRequest = (request: Lean<IRateRequest>) => ({
  _id: String(request._id),
  origin: request.origin,
  destination: request.destination,
  commodity: request.commodity,
  containerSize: request.containerSize || undefined,
  note: request.note || undefined,
  customer: {
    name: request.customerName,
    company: request.customerCompany || undefined,
    email: request.customerEmail,
  },
  status: request.status,
  createdAt: iso(request.createdAt)!,
  resolvedAt: iso(request.resolvedAt),
});
