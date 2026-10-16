import type {
  ShipmentEvent,
  ShipmentSummary,
} from "../integrations/maersk/tracking.client.js";

export type MaerskStatus = "confirmed" | "in_transit" | "arrived" | "cancelled";

const place = (name?: string, code?: string) =>
  [name, code && `(${code})`].filter(Boolean).join(" ") || "port";

const vesselText = (vessel?: { name?: string }, voyage?: string) =>
  [vessel?.name, voyage].filter(Boolean).join(" ");

// The status Maersk's events describe, or null when they don't settle it.
// A booking Maersk rejected or cancelled (latest booking-document event) that
// never actually sailed is cancelled; otherwise arrival beats departure beats
// a confirmed booking or planned route.
export const maerskStatus = (
  events: ShipmentEvent[],
  summary: ShipmentSummary,
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
