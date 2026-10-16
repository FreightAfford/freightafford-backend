import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  deriveShipmentSummary,
  toShipmentEvents,
  type ShipmentEvent,
} from "../integrations/maersk/tracking.client.js";
import { maerskStatus } from "./maersk-status.js";

const fixture = (name: string) =>
  toShipmentEvents(
    JSON.parse(
      readFileSync(
        new URL(
          `../integrations/maersk/__fixtures__/track-and-trace/${name}.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ).events,
  );

const statusOf = (
  events: ShipmentEvent[],
  ports?: { polCode?: string; podCode?: string },
) => maerskStatus(events, deriveShipmentSummary(events, ports));

describe("maerskStatus", () => {
  it("is cancelled when the carrier rejected the booking", () => {
    assert.deepEqual(statusOf(fixture("cancelled-rejected")), {
      status: "cancelled",
      description: "Maersk: booking rejected by the carrier.",
    });
  });

  it("is confirmed before departure", () => {
    const result = statusOf(fixture("confirmed-transshipment"));
    assert.equal(result?.status, "confirmed");
    assert.match(result!.description, /Apapa Port \(NGAPP\)/);
  });

  it("is confirmed while Maersk hasn't assigned a vessel", () => {
    const result = statusOf(fixture("confirmed-pending-vessel"));
    assert.equal(result?.status, "confirmed");
    assert.match(result!.description, /Departure from .+ \(NGTIN\) planned/);
  });

  it("is in transit after the actual departure", () => {
    assert.deepEqual(
      statusOf(fixture("in-transit-departed"), { polCode: "NGAPP" }),
      {
        status: "in_transit",
        description: "Maersk: departed Apapa Port (NGAPP) on MAERSK FRIO 638E.",
      },
    );
  });

  // The POL estimate never turned actual; the cargo sailed from a nearby port
  it("is in transit when a feeder sailed from another port", () => {
    const events = fixture("arrived-feeder-from-other-port").filter(
      (e) => !(e.code === "ARRI" && e.classifier === "ACT") && e.code !== "DISC",
    );
    const result = statusOf(events, { polCode: "NGAPP" });
    assert.equal(result?.status, "in_transit");
    assert.match(result!.description, /\(NGTIN\) on LISA 621N/);
  });

  it("is arrived after the actual arrival at the POD", () => {
    assert.deepEqual(
      statusOf(fixture("arrived-feeder-from-other-port"), { podCode: "MXZLO" }),
      {
        status: "arrived",
        description:
          "Maersk: arrived at SSA Mexico (MXZLO) on MAERSK EDIRNE 631W.",
      },
    );
  });

  it("is null when nothing settles it", () => {
    assert.equal(statusOf([]), null);
  });
});
