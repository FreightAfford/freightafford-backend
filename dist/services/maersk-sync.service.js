import { createTrackingEvent } from "../controllers/tracking.controller.js";
import { deriveShipmentSummary, getShipmentEvents, isTrackingQuotaBlocked, shipmentContainers, } from "../integrations/maersk/tracking.client.js";
import Booking from "../models/booking.model.js";
import { sendBookingScheduleNotification, sendShipmentStatusUpdate, } from "./booking.service.js";
import { maerskStatus } from "./maersk-status.js";
// Maersk's quota is unpublished, so each run only takes the bookings synced
// longest ago and stops at the first 429.
const MAX_PER_RUN = 20;
const CONCURRENCY = 2;
// Bookings whose status Maersk still decides. `arrived` stays in until
// Maersk has confirmed the arrival, so a manual "arrived" gets corrected.
// Delivery and cancellation are manual and final.
const SYNCABLE_STATUSES = ["awaiting_confirmation", "confirmed", "in_transit"];
const STATUS_TEXT = {
    confirmed: "confirmed",
    in_transit: "in transit",
    arrived: "arrived",
    cancelled: "cancelled",
};
// Carrier booking number first (admins enter it in Update Shipping Details),
// then the first container number.
const trackingReferences = (booking) => {
    const refs = [];
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
export const hasTrackingReference = (booking) => trackingReferences(booking).length > 0;
// Tries each reference in turn and returns the first one Maersk knows.
// Throws AppError(503) when Maersk is unreachable.
export const fetchBookingEvents = async (booking, { fresh = false } = {}) => {
    const refs = trackingReferences(booking);
    for (const { ref, value } of refs) {
        const events = await getShipmentEvents(ref, { fresh });
        if (events.length)
            return { reference: value, events };
    }
    return { reference: refs[0]?.value ?? null, events: [] };
};
const portCodes = (booking) => {
    const request = booking.freightRequest;
    return {
        polCode: request?.originPortCode,
        podCode: request?.destinationPortCode,
    };
};
const sameDate = (a, b) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);
const vesselKey = (name) => name?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
// null when there's no previous vessel to compare against
const sameVesselName = (current, next) => vesselKey(current) ? vesselKey(current) === vesselKey(next) : null;
// Ports for the customer emails; empty for legacy requests.
const routeOf = (booking) => {
    const request = booking.freightRequest;
    return {
        originPort: request?.originPort,
        destinationPort: request?.destinationPort,
        originPortCode: request?.originPortCode,
        destinationPortCode: request?.destinationPortCode,
    };
};
// Tells the customer their shipment moved to another vessel. Failure is
// only logged, like the status emails.
const notifyVesselChange = async (booking) => {
    const customer = booking.customer;
    const { error } = await sendBookingScheduleNotification(customer.email, customer.fullname, booking.carrierBookingNumber ?? "", booking.shippingLine ?? "Maersk", booking.vessel ?? "", booking.sailingDate, undefined, {
        ...routeOf(booking),
        bookingNumber: booking.bookingNumber,
        eta: booking.eta,
        isUpdate: true,
    });
    if (error)
        console.error(`[maersk-sync] Vessel email failed for booking ${booking.bookingNumber}: ${JSON.stringify(error)}`);
};
// Sets the status Maersk reports, mirroring the manual/auto-transit flow:
// save, email the customer (failure is only logged), then log a tracking event.
const applyStatus = async (booking, next, description) => {
    const customer = booking.customer;
    const request = booking.freightRequest;
    booking.status = next;
    await booking.save();
    const { error } = await sendShipmentStatusUpdate(customer.email, customer.fullname, booking.bookingNumber, STATUS_TEXT[next], { ...routeOf(booking), vessel: booking.vessel, eta: booking.eta });
    if (error)
        console.error(`[maersk-sync] Email failed for booking ${booking.bookingNumber}: ${JSON.stringify(error)}`);
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
    }
    catch (err) {
        console.error(`[maersk-sync] Tracking event failed for booking ${booking.bookingNumber}:`, err);
    }
};
// Pulls Maersk events for one booking and applies them: sailing date, ETA,
// vessel and status all follow Maersk, in either direction (e.g. a manual
// "arrived" goes back to in_transit until Maersk reports the arrival).
// Delivered and cancelled bookings keep their status.
// `prefetched` reuses events the caller already has (the live tracking view)
// instead of calling Maersk again.
export const syncBookingWithMaersk = async (bookingId, { prefetched, } = {}) => {
    const booking = await Booking.findById(bookingId)
        .populate("customer", "fullname email")
        .populate("freightRequest", "originPort destinationPort originPortCode destinationPortCode");
    if (!booking || booking.shippingLine !== "Maersk" || booking.status === "cancelled")
        return { outcome: "skipped", booking };
    const now = new Date();
    let result;
    try {
        result = prefetched ?? (await fetchBookingEvents(booking, { fresh: true }));
    }
    catch (err) {
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
    // The team rarely types container numbers, so add the ones Maersk reports.
    // Saved silently, and never removes one entered by hand.
    const existing = booking.containers ?? [];
    const missing = shipmentContainers(result.events).filter((c) => !existing.includes(c));
    if (missing.length) {
        booking.containers = [...existing, ...missing];
        changed = true;
    }
    booking.maerskSync = {
        status: "ok",
        lastSyncedAt: now,
        reference: result.reference ?? undefined,
        departedAt: summary.hasDeparted ? new Date(departure.at) : undefined,
        arrivedAt: summary.hasArrived && arrival ? new Date(arrival.at) : undefined,
    };
    await booking.save();
    const reported = maerskStatus(result.events, summary);
    if (reported &&
        reported.status !== booking.status &&
        booking.status !== "delivered") {
        await applyStatus(booking, reported.status, reported.description);
        changed = true;
    }
    if (vesselChanged)
        await notifyVesselChange(booking);
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
    const counts = {
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
        const results = await Promise.allSettled(batch.map((b) => syncBookingWithMaersk(b._id.toString())));
        for (const r of results) {
            if (r.status === "fulfilled")
                counts[r.value.outcome]++;
            else {
                counts.error++;
                console.error("[maersk-sync] Booking sync failed:", r.reason);
            }
        }
    }
    console.log(`[maersk-sync] checked ${bookings.length}, updated ${counts.updated}, unchanged ${counts.unchanged}, not_found ${counts.not_found}, errors ${counts.error}`);
};
//# sourceMappingURL=maersk-sync.service.js.map