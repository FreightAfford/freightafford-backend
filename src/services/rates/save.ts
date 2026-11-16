import type { ClientSession, Types } from "mongoose";
import RateRequest from "../../models/rate-request.model.js";
import type { IRateRequest, IUser } from "../../utils/interface.js";
import type { RateInput } from "../../validations/rate.validation.js";
import { sendRateReadyEmail } from "../rate-email.service.js";
import { resolveRateCommodity, resolveRatePort } from "./maersk-refs.js";
import { lagosToday, matchAnswered, type RateLike } from "./rules.js";

// Saving rates, shared by the rate form (create, update) and the import.

/**
 * A checked rate input as a document to save: ports and the commodity
 * looked up again at Maersk, so their names are Maersk's, and the editor.
 */
export const toRateDoc = async (input: RateInput, user: IUser) => {
  const [origin, destination, commodity] = await Promise.all([
    resolveRatePort(input.origin, "Origin"),
    resolveRatePort(input.destination, "Destination"),
    input.commodityCode ? resolveRateCommodity({ code: input.commodityCode }) : null,
  ]);
  return {
    ...input,
    origin,
    destination,
    // A rate saved before it had a Maersk code keeps its own name.
    commodity: commodity?.name ?? input.commodity,
    commodityCode: commodity?.code,
    updatedBy: user._id,
    updatedByName: user.fullname,
  };
};

type SavedRate = RateLike & { _id: Types.ObjectId | unknown };
export type ResolvedRequest = { request: IRateRequest; rate: SavedRate };

/**
 * Marks the open requests these rates answer as resolved: same lane and
 * commodity, asked for the rate's size or any size. An expired rate answers
 * nothing (the customer couldn't use it); an upcoming one does, and the
 * email says when it starts. Returns what it resolved, for the emails.
 */
export const resolveAnsweredRequests = async (
  rates: SavedRate[],
  user: IUser,
  session?: ClientSession,
): Promise<ResolvedRequest[]> => {
  const usable = rates.filter((r) => r.validTo >= lagosToday());
  if (!usable.length) return [];

  const lanes = [...new Map(usable.map((r) => [`${r.origin.code}|${r.destination.code}`, r])).values()];
  const open = await RateRequest.find({
    status: "open",
    $or: lanes.map((r) => ({ "origin.code": r.origin.code, "destination.code": r.destination.code })),
  }).session(session ?? null);

  const resolved = matchAnswered(usable, open, lagosToday());
  if (!resolved.length) return [];

  const now = new Date();
  await RateRequest.bulkWrite(
    resolved.map(({ request, rate }) => ({
      updateOne: {
        filter: { _id: request._id, status: "open" },
        update: {
          $set: { status: "resolved", resolvedAt: now, resolvedBy: user._id, resolvedByRate: rate._id },
        },
      },
    })) as never,
    { session },
  );
  return resolved;
};

/**
 * One "Your rate is ready" email per customer, listing every request of
 * theirs this save answered. Run after the save; failures are only logged.
 */
export const emailAnsweredCustomers = async (resolved: ResolvedRequest[]) => {
  const byCustomer = new Map<string, ResolvedRequest[]>();
  for (const item of resolved) {
    const key = item.request.customerEmail.toLowerCase();
    byCustomer.set(key, [...(byCustomer.get(key) ?? []), item]);
  }
  const today = lagosToday();
  await Promise.all(
    [...byCustomer.values()].map(async (items) => {
      const { request } = items[0];
      try {
        const { error } = await sendRateReadyEmail(
          { email: request.customerEmail, name: request.customerName },
          items.map(({ request, rate }) => ({
            origin: request.origin,
            destination: request.destination,
            commodity: request.commodity.name,
            containerSize: request.containerSize ?? rate.containerSize,
            startsOn: rate.validFrom > today ? rate.validFrom : undefined,
          })),
        );
        if (error) console.error("[rates] failed to email a customer their rate:", error);
      } catch (error) {
        console.error("[rates] failed to email a customer their rate:", error);
      }
    }),
  );
};

