import { createTrackingEvent } from "../controllers/tracking.controller.js";
import { deriveShipmentSummary, getShipmentEvents, isTrackingQuotaBlocked, } from "../integrations/maersk/tracking.client.js";
import Booking from "../models/booking.model.js";
import { sendShipmentStatusUpdate } from "./booking.service.js";
// The public-access tier has a small, unpublished quota, so each run only
// takes the bookings synced longest ago and stops at the first 429.
const MAX_PER_RUN = 20;
const CONCURRENCY = 2;
// Bookings Maersk can still move forward. `arrived` is left out: delivery
// stays a manual step.
const SYNCABLE_STATUSES = ["awaiting_confirmation", "confirmed", "in_transit"];
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
const place = (name, code) => [name, code && `(${code})`].filter(Boolean).join(" ") || "port";
const vesselText = (vessel, voyage) => [vessel?.name, voyage].filter(Boolean).join(" ");
// Moves status forward one step, mirroring the manual/auto-transit flow:
// save, email the customer (failure is only logged), then log a tracking event.
const advanceStatus = async (booking, next, description) => {
    const customer = booking.customer;
    const request = booking.freightRequest;
    booking.status = next;
    await booking.save();
    const { error } = await sendShipmentStatusUpdate(customer.email, customer.fullname, booking.bookingNumber, next === "in_transit" ? "in transit" : "arrived");
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
// Pulls Maersk events for one booking and applies them: sailing date, ETA and
// vessel always follow Maersk; status only ever moves forward
// (confirmed → in_transit → arrived), so a manual admin change is never undone.
export const syncBookingWithMaersk = async (bookingId) => {
    const booking = await Booking.findById(bookingId)
        .populate("customer", "fullname email")
        .populate("freightRequest", "originPort destinationPort originPortCode destinationPortCode");
    if (!booking || booking.shippingLine !== "Maersk" || booking.status === "cancelled")
        return { outcome: "skipped", booking };
    const now = new Date();
    let result;
    try {
        result = await fetchBookingEvents(booking, { fresh: true });
    }
    catch (err) {
        // A failed call says nothing about the shipment: keep a previous "ok" so
        // the booking isn't handed back to the sailing-date job over an outage.
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
    if (departure?.vessel?.name && booking.vessel !== departure.vessel.name) {
        booking.vessel = departure.vessel.name;
        booking.vesselImo = departure.vessel.imo;
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
    if (booking.status === "confirmed" && summary.hasDeparted) {
        await advanceStatus(booking, "in_transit", `Maersk: departed ${place(departure.locationName, departure.locationCode)}${departure.vessel?.name
            ? ` on ${vesselText(departure.vessel, departure.voyage)}`
            : ""}.`);
        changed = true;
    }
    if (booking.status === "in_transit" && summary.hasArrived) {
        await advanceStatus(booking, "arrived", `Maersk: arrived at ${place(arrival?.locationName, arrival?.locationCode)}${arrival?.vessel?.name
            ? ` on ${vesselText(arrival.vessel, arrival.voyage)}`
            : ""}.`);
        changed = true;
    }
    return { outcome: changed ? "updated" : "unchanged", booking };
};
// Cron entry point: syncs every active Maersk booking that has a reference.
export const runMaerskSync = async () => {
    const bookings = await Booking.find({
        shippingLine: "Maersk",
        status: { $in: SYNCABLE_STATUSES },
        $or: [
            { carrierBookingNumber: { $exists: true, $nin: [null, ""] } },
            { "containers.0": { $exists: true } },
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