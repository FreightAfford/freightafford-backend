import type { HydratedDocument } from "mongoose";
import { createTrackingEvent } from "../controllers/tracking.controller.js";
import {
  deriveShipmentSummary,
  getShipmentEvents,
  isTrackingQuotaBlocked,
  type ShipmentEvent,
  type TrackingReference,
} from "../integrations/maersk/tracking.client.js";
import Booking from "../models/booking.model.js";
import type { IBooking, IFreightRequest, IUser } from "../utils/interface.js";
import {
  sendBookingScheduleNotification,
  sendShipmentStatusUpdate,
} from "./booking.service.js";

type BookingDoc = HydratedDocument<IBooking>;

export type SyncOutcome =
  | "updated"
  | "unchanged"
  | "not_found"
  | "error"
  | "skipped";

// Maersk's quota is unpublished, so each run only takes the bookings synced
// longest ago and stops at the first 429.
const MAX_PER_RUN = 20;
const CONCURRENCY = 2;

// Bookings whose status Maersk still decides. `arrived` stays in until
// Maersk has confirmed the arrival, so a manual "arrived" gets corrected.
// Delivery and cancellation are manual and final.
const SYNCABLE_STATUSES = ["awaiting_confirmation", "confirmed", "in_transit"];

type MaerskStatus = "confirmed" | "in_transit" | "arrived" | "cancelled";

const STATUS_TEXT: Record<MaerskStatus, string> = {
  confirmed: "confirmed",
  in_transit: "in transit",
  arrived: "arrived",
  cancelled: "cancelled",
};

// Carrier booking number first (admins enter it in Update Shipping Details),
// then the first container number.
const trackingReferences = (booking: IBooking) => {
  const refs: { ref: TrackingReference; value: string }[] = [];
  const bkg = booking.carrierBookingNumber
    ?.replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  if (bkg)
    refs.push({ ref: { carrierBookingReference: bkg }, value: bkg });
  const container = booking.containers?.[0];
  if (container)
    refs.push({ ref: { equipmentReference: container }, value: container });
  return refs;
};

export const hasTrackingReference = (booking: IBooking) =>
  trackingReferences(booking).length > 0;

// Tries each reference in turn and returns the first one Maersk knows.
// Throws AppError(503) when Maersk is unreachable.
export const fetchBookingEvents = async (
  booking: IBooking,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<{ reference: string | null; events: ShipmentEvent[] }> => {
  const refs = trackingReferences(booking);

  for (const { ref, value } of refs) {
    const events = await getShipmentEvents(ref, { fresh });
    if (events.length) return { reference: value, events };
  }

  return { reference: refs[0]?.value ?? null, events: [] };
};

const portCodes = (booking: IBooking) => {
  const request = booking.freightRequest as unknown as IFreightRequest | null;
  return {
    polCode: request?.originPortCode,
    podCode: request?.destinationPortCode,
  };
};

const sameDate = (a?: Date | null, b?: Date | null) =>
  (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

const place = (name?: string, code?: string) =>
  [name, code && `(${code})`].filter(Boolean).join(" ") || "port";

const vesselText = (vessel?: { name?: string }, voyage?: string) =>
  [vessel?.name, voyage].filter(Boolean).join(" ");

const vesselKey = (name?: string) =>
  name?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";

// null when there's no previous vessel to compare against
const sameVesselName = (current: string | undefined, next: string) =>
  vesselKey(current) ? vesselKey(current) === vesselKey(next) : null;

// Tells the customer their shipment moved to another vessel. Failure is
// only logged, like the status emails.
const notifyVesselChange = async (booking: BookingDoc) => {
  const customer = booking.customer as unknown as IUser;
  const { error } = await sendBookingScheduleNotification(
    customer.email,
    customer.fullname,
    booking.carrierBookingNumber ?? "",
    booking.shippingLine ?? "Maersk",
    booking.vessel ?? "",
    booking.sailingDate,
    "Shipping Details Updated",
  );
  if (error)
    console.error(
      `[maersk-sync] Vessel email failed for booking ${booking.bookingNumber}: ${JSON.stringify(error)}`,
    );
};

// The status Maersk's events describe, or null when they don't settle it.
// A booking Maersk rejected or cancelled (latest booking-document event) that
// never actually sailed is cancelled; otherwise arrival beats departure beats
// a confirmed booking or planned route.
const maerskStatus = (
  events: ShipmentEvent[],
  summary: ReturnType<typeof deriveShipmentSummary>,
): { status: MaerskStatus; description: string } | null => {
  const actualDeparture = events.find(
    (e) => e.type === "TRANSPORT" && e.code === "DEPA" && e.classifier === "ACT",
  );
  const lastBookingEvent = events
    .filter(
      (e) =>
        e.type === "SHIPMENT" &&
        e.documentType === "BKG" &&
        ["CONF", "REJE", "CANC"].includes(e.code),
    )
    .at(-1);

  if (
    !actualDeparture &&
    (lastBookingEvent?.code === "REJE" || lastBookingEvent?.code === "CANC")
  )
    return {
      status: "cancelled",
      description: `Maersk: booking ${lastBookingEvent.code === "REJE" ? "rejected" : "cancelled"} by the carrier.`,
    };

  const { departure, arrival } = summary;

  if (summary.hasArrived)
    return {
      status: "arrived",
      description: `Maersk: arrived at ${place(arrival?.locationName, arrival?.locationCode)}${
        arrival?.vessel?.name
          ? ` on ${vesselText(arrival.vessel, arrival.voyage)}`
          : ""
      }.`,
    };

  // Feeder legs can sail from a different port than the planned first one
  const sailed =
    summary.hasDeparted && departure
      ? {
          name: departure.locationName,
          code: departure.locationCode,
          vessel: departure.vessel,
          voyage: departure.voyage,
        }
      : actualDeparture && {
          name: actualDeparture.location?.name,
          code: actualDeparture.location?.code,
          vessel: actualDeparture.vessel,
          voyage: actualDeparture.voyage,
        };
  if (sailed)
    return {
      status: "in_transit",
      description: `Maersk: departed ${place(sailed.name, sailed.code)}${
        sailed.vessel?.name
          ? ` on ${vesselText(sailed.vessel, sailed.voyage)}`
          : ""
      }.`,
    };

  if (
    lastBookingEvent?.code === "CONF" ||
    events.some((e) => e.type === "TRANSPORT")
  )
    return {
      status: "confirmed",
      description: departure
        ? `Maersk: booking confirmed, not yet departed. Departure from ${place(departure.locationName, departure.locationCode)} planned for ${new Date(departure.at).toDateString()}.`
        : "Maersk: booking confirmed, not yet departed.",
    };

  return null;
};

// Sets the status Maersk reports, mirroring the manual/auto-transit flow:
// save, email the customer (failure is only logged), then log a tracking event.
const applyStatus = async (
  booking: BookingDoc,
  next: MaerskStatus,
  description: string,
) => {
  const customer = booking.customer as unknown as IUser;
  const request = booking.freightRequest as unknown as IFreightRequest | null;

  booking.status = next;
  await booking.save();

  const { error } = await sendShipmentStatusUpdate(
    customer.email,
    customer.fullname,
    booking.bookingNumber,
    STATUS_TEXT[next],
  );
  if (error)
    console.error(
      `[maersk-sync] Email failed for booking ${booking.bookingNumber}: ${JSON.stringify(error)}`,
    );

  try {
    await createTrackingEvent({
      bookingId: booking._id.toString(),
      event: next,
      description,
      location: {
        originPort: request?.originPort ?? "",
        destinationPort: request?.destinationPort ?? "",
      },
      userId: "system",
    });
  } catch (err) {
    console.error(
      `[maersk-sync] Tracking event failed for booking ${booking.bookingNumber}:`,
      err,
    );
  }
};

// Pulls Maersk events for one booking and applies them: sailing date, ETA,
// vessel and status all follow Maersk, in either direction (e.g. a manual
// "arrived" goes back to in_transit until Maersk reports the arrival).
// Delivered and cancelled bookings keep their status.
// `prefetched` reuses events the caller already has (the live tracking view)
// instead of calling Maersk again.
export const syncBookingWithMaersk = async (
  bookingId: string,
  {
    prefetched,
  }: {
    prefetched?: { reference: string | null; events: ShipmentEvent[] };
  } = {},
): Promise<{
  outcome: SyncOutcome;
  booking: BookingDoc | null;
  message?: string;
}> => {
  const booking = await Booking.findById(bookingId)
    .populate("customer", "fullname email")
    .populate(
      "freightRequest",
      "originPort destinationPort originPortCode destinationPortCode",
    );

  if (!booking || booking.shippingLine !== "Maersk" || booking.status === "cancelled")
    return { outcome: "skipped", booking };

  const now = new Date();
  let result: Awaited<ReturnType<typeof fetchBookingEvents>>;

  try {
    result = prefetched ?? (await fetchBookingEvents(booking, { fresh: true }));
  } catch (err) {
    // A failed call says nothing about the shipment: keep a previous "ok"
    // rather than recording an outage as the booking's state.
    if (!booking.maerskSync?.status) {
      booking.maerskSync = { status: "error", lastSyncedAt: now };
      await booking.save();
    }
    return {
      outcome: "error",
      booking,
      message: err instanceof Error ? err.message : undefined,
    };
  }

  if (!result.events.length) {
    booking.maerskSync = {
      status: "not_found",
      lastSyncedAt: now,
      reference: result.reference ?? undefined,
    };
    await booking.save();
    return { outcome: "not_found", booking };
  }

  const summary = deriveShipmentSummary(result.events, portCodes(booking));
  const { departure, arrival } = summary;
  let changed = false;

  if (departure && !sameDate(booking.sailingDate, new Date(departure.at))) {
    booking.sailingDate = new Date(departure.at);
    changed = true;
  }
  if (arrival && !sameDate(booking.eta, new Date(arrival.at))) {
    booking.eta = new Date(arrival.at);
    changed = true;
  }
  // Only a different ship is news to the customer; Maersk's spelling of the
  // name an admin typed ("Maersk Frio" vs "MAERSK FRIO") is just saved.
  let vesselChanged = false;
  if (departure?.vessel?.name && booking.vessel !== departure.vessel.name) {
    vesselChanged =
      booking.vesselImo && departure.vessel.imo
        ? booking.vesselImo !== departure.vessel.imo
        : sameVesselName(booking.vessel, departure.vessel.name) === false;
    booking.vessel = departure.vessel.name;
    booking.vesselImo = departure.vessel.imo;
    changed = true;
  }

  booking.maerskSync = {
    status: "ok",
    lastSyncedAt: now,
    reference: result.reference ?? undefined,
    departedAt: summary.hasDeparted ? new Date(departure!.at) : undefined,
    arrivedAt:
      summary.hasArrived && arrival ? new Date(arrival.at) : undefined,
  };
  await booking.save();

  const reported = maerskStatus(result.events, summary);
  if (
    reported &&
    reported.status !== booking.status &&
    booking.status !== "delivered"
  ) {
    await applyStatus(booking, reported.status, reported.description);
    changed = true;
  }

  if (vesselChanged) await notifyVesselChange(booking);

  return { outcome: changed ? "updated" : "unchanged", booking };
};

// Cron entry point: syncs every active Maersk booking that has a reference.
export const runMaerskSync = async () => {
  const bookings = await Booking.find({
    shippingLine: "Maersk",
    $and: [
      {
        $or: [
          { status: { $in: SYNCABLE_STATUSES } },
          { status: "arrived", "maerskSync.arrivedAt": { $exists: false } },
        ],
      },
      {
        $or: [
          { carrierBookingNumber: { $exists: true, $nin: [null, ""] } },
          { "containers.0": { $exists: true } },
        ],
      },
    ],
  })
    .sort({ "maerskSync.lastSyncedAt": 1 })
    .limit(MAX_PER_RUN)
    .select("_id");

  const counts: Record<SyncOutcome, number> = {
    updated: 0,
    unchanged: 0,
    not_found: 0,
    error: 0,
    skipped: 0,
  };

  for (let i = 0; i < bookings.length; i += CONCURRENCY) {
    if (isTrackingQuotaBlocked()) {
      console.error("[maersk-sync] Quota exceeded; stopping this run early.");
      break;
    }
    const batch = bookings.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((b) => syncBookingWithMaersk(b._id.toString())),
    );
    for (const r of results) {
      if (r.status === "fulfilled") counts[r.value.outcome]++;
      else {
        counts.error++;
        console.error("[maersk-sync] Booking sync failed:", r.reason);
      }
    }
  }

  console.log(
    `[maersk-sync] checked ${bookings.length}, updated ${counts.updated}, unchanged ${counts.unchanged}, not_found ${counts.not_found}, errors ${counts.error}`,
  );
};
