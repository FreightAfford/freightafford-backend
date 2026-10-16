import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  deriveShipmentSummary,
  shipmentContainers,
  toShipmentEvents,
  type ShipmentEvent,
} from "./tracking.client.js";
import { isPlaceholderVessel } from "./vessels.client.js";

// Real Track & Trace responses (booking, container and seal numbers replaced)
const fixture = (name: string) =>
  toShipmentEvents(
    JSON.parse(
      readFileSync(
        new URL(`./__fixtures__/track-and-trace/${name}.json`, import.meta.url),
        "utf8",
      ),
    ).events,
  );

describe("toShipmentEvents", () => {
  it("sorts events by when they happen", () => {
    const events = fixture("in-transit-transshipment");
    const times = events.map((e) => new Date(e.dateTime).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  it("labels transport events by classifier", () => {
    const events = fixture("in-transit-departed");
    const labels = events
      .filter((e) => e.type === "TRANSPORT")
      .map((e) => `${e.code} ${e.classifier} ${e.label}`);
    assert.ok(labels.includes("DEPA ACT Vessel departed"));
    assert.ok(labels.includes("ARRI EST Vessel arrival"));
  });

  // Maersk sends 1 Jan 2099 (port time) for calls it hasn't scheduled and
  // "PENDING MOTHER VSL" for a vessel it hasn't assigned
  it("drops placeholder dates and vessels", () => {
    const events = fixture("confirmed-pending-vessel");
    assert.equal(events.filter((e) => e.type === "TRANSPORT").length, 1);
    for (const e of events) {
      assert.ok(new Date(e.dateTime).getUTCFullYear() < 2098, e.dateTime);
      assert.equal(e.vessel, undefined);
      assert.equal(e.voyage, undefined);
    }
  });
});

describe("deriveShipmentSummary", () => {
  it("uses the freight request's POL and POD", () => {
    const summary = deriveShipmentSummary(fixture("in-transit-transshipment"), {
      polCode: "NGTIN",
      podCode: "BRSSZ",
    });
    assert.equal(summary.departure?.locationCode, "NGTIN");
    assert.equal(summary.departure?.classifier, "ACT");
    assert.equal(summary.departure?.vessel?.imo, "9313955");
    assert.equal(summary.arrival?.locationCode, "BRSSZ");
    assert.equal(summary.arrival?.classifier, "EST");
    assert.equal(summary.arrival?.at, "2026-11-06T07:00:00-03:00");
    assert.equal(summary.hasDeparted, true);
    assert.equal(summary.hasArrived, false);
  });

  it("falls back to the first departure and last arrival without port codes", () => {
    const summary = deriveShipmentSummary(fixture("confirmed-transshipment"));
    assert.equal(summary.departure?.locationCode, "NGAPP");
    assert.equal(summary.arrival?.locationCode, "CNBJS");
    assert.equal(summary.hasDeparted, false);
  });

  it("falls back when the POD code isn't in the events", () => {
    const summary = deriveShipmentSummary(fixture("in-transit-departed"), {
      polCode: "NGAPP",
      podCode: "NGLOS",
    });
    assert.equal(summary.arrival?.locationCode, "INPTL");
  });

  it("splits the route into one leg per vessel and voyage", () => {
    const { legs } = deriveShipmentSummary(fixture("confirmed-transshipment"));
    assert.deepEqual(
      legs.map((l) => [l.vessel?.name, l.voyage, l.from?.code, l.to?.code]),
      [
        ["MAERSK CASABLANCA", "641E", "NGAPP", "MYTPP"],
        ["MAERSK SEBAROK", "649N", "MYTPP", "CNTXG"],
        [undefined, undefined, "CNTXG", "CNBJS"],
      ],
    );
  });

  it("marks arrival from the actual arrival at the POD", () => {
    const summary = deriveShipmentSummary(
      fixture("arrived-feeder-from-other-port"),
      { polCode: "NGTIN", podCode: "MXZLO" },
    );
    assert.equal(summary.departure?.classifier, "ACT");
    assert.equal(summary.departure?.at, "2026-06-19T22:15:00+01:00");
    assert.equal(summary.arrival?.classifier, "ACT");
    assert.equal(summary.hasArrived, true);
  });

  it("has no arrival when every arrival is a placeholder", () => {
    const summary = deriveShipmentSummary(fixture("confirmed-pending-vessel"));
    assert.equal(summary.arrival, null);
    assert.equal(summary.departure?.at, "2026-11-09T13:00:00+01:00");
    assert.equal(summary.departure?.vessel, undefined);
  });

  it("is empty for a booking with no transport events", () => {
    const summary = deriveShipmentSummary(fixture("cancelled-rejected"));
    assert.equal(summary.departure, null);
    assert.equal(summary.arrival, null);
    assert.deepEqual(summary.legs, []);
  });
});

describe("shipmentContainers", () => {
  const box = (
    container: string,
    code: string,
    empty: boolean,
  ): ShipmentEvent => ({
    id: `${container}-${code}-${empty}`,
    type: "EQUIPMENT",
    code,
    classifier: "ACT",
    dateTime: "2026-10-01T10:00:00+01:00",
    label: code,
    container,
    empty,
  });

  it("lists the containers Maersk reports", () => {
    assert.deepEqual(shipmentContainers(fixture("in-transit-transshipment")), [
      "TEST0000002",
    ]);
  });

  // Delivered boxes come back empty at the end; still this cargo's container
  it("keeps a container returned empty after delivery", () => {
    assert.deepEqual(
      shipmentContainers(fixture("arrived-feeder-from-other-port")),
      ["TEST0000003"],
    );
  });

  it("has none before the cargo reaches a container", () => {
    assert.deepEqual(shipmentContainers(fixture("confirmed-transshipment")), []);
  });

  it("skips boxes that were only ever empty and bad numbers", () => {
    const events = [
      box("MSKU1111111", "GTOT", true),
      box("MSKU1111111", "GTIN", true),
      box("mrku2222222", "GTIN", false),
      box("MRKU3333333", "LOAD", false),
      box("MRKU2222222", "LOAD", false),
      box("NOT-A-BOX", "LOAD", false),
    ];
    assert.deepEqual(shipmentContainers(events), [
      "MRKU2222222",
      "MRKU3333333",
    ]);
  });
});

describe("isPlaceholderVessel", () => {
  it("spots Maersk's placeholder vessels", () => {
    assert.equal(isPlaceholderVessel("PENDING MOTHER VSL", "99999"), true);
    assert.equal(isPlaceholderVessel("Some Barge", "99999"), true);
    assert.equal(isPlaceholderVessel("DUMMY VESSEL"), true);
    assert.equal(isPlaceholderVessel("MAERSK FRIO", "OYGR2"), false);
    assert.equal(isPlaceholderVessel(undefined), false);
  });
});
