import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  filterWindow,
  routesInWindow,
  toActivePorts,
  toPortCalls,
  toRoutes,
  toTerminals,
  type MaerskPortSchedule,
  type MaerskRoute,
} from "./schedules.client.js";

// Real Commercial Schedules responses, captured 19 Oct 2026 (date=2026-10-20)
const fixture = <T>(name: string): T =>
  JSON.parse(
    readFileSync(
      new URL(`./__fixtures__/commercial-schedules/${name}.json`, import.meta.url),
      "utf8",
    ),
  );

const apapa = () => toTerminals(fixture<MaerskPortSchedule[]>("port-ngapp"));
const tinCan = () => toTerminals(fixture<MaerskPortSchedule[]>("port-ngtin"));

describe("toTerminals", () => {
  it("maps one terminal per Maersk entry", () => {
    const terminals = apapa();
    assert.equal(terminals.length, 1);
    assert.equal(terminals[0].name, "Apapa Port");
    assert.equal(terminals[0].smdgCode, "APMTER");
    assert.equal(terminals[0].calls.length, 69);
  });

  it("keeps planned and estimated times in port time", () => {
    const call = apapa()[0].calls.find(
      (c) => c.vessel?.name === "MAERSK CASABLANCA",
    );
    assert.deepEqual(call.arrival, {
      estimated: "2026-10-19T20:00:00+01:00",
      planned: "2026-10-11T10:00:00+01:00",
    });
    assert.equal(call.departure.estimated, "2026-10-23T03:00:00+01:00");
    assert.deepEqual(call.services, [
      { name: "FEW2", code: "FW2", voyageIn: "638W", voyageOut: "641E" },
    ]);
    assert.equal(call.vessel.imo, "9525467");
  });

  it("maps cut-offs by code", () => {
    const call = apapa()[0].calls.find(
      (c) => c.vessel?.name === "MAERSK CARDIFF",
    );
    const codes = Object.fromEntries(call.cutOffs.map((c) => [c.code, c.at]));
    assert.equal(codes.DCO, "2026-10-18T16:00:00+01:00");
    assert.equal(codes.FCO, "2026-10-18T08:00:00+01:00");
  });

  it("handles a port that publishes no cut-offs", () => {
    const calls = tinCan()[0].calls;
    assert.equal(calls.length, 27);
    assert.ok(calls.every((c) => c.cutOffs.length === 0));
  });
});

describe("toPortCalls", () => {
  it("drops 2099 placeholder dates and unassigned vessels", () => {
    const [call] = toPortCalls([
      {
        isDummyVessel: true,
        vessel: { name: "PENDING MOTHER VSL", callSign: "99999" },
        servicePartners: [
          { carrierServiceName: "FEW2", carrierImportVoyageNumber: "650W" },
        ],
        timestamps: [
          {
            eventTypeCode: "ARRI",
            eventClassifierCode: "PLN",
            eventDateTime: "2099-01-01T00:00:00+01:00",
          },
          {
            eventTypeCode: "DEPA",
            eventClassifierCode: "EST",
            eventDateTime: "2026-12-01T10:00:00+01:00",
          },
        ],
        cutOffTimes: [
          { cutOffDateTimeCode: "DCO", cutOffDateTime: "2099-01-01T00:00:00+01:00" },
        ],
      },
    ]);
    assert.equal(call.vessel, null);
    assert.deepEqual(call.arrival, {});
    assert.equal(call.departure.estimated, "2026-12-01T10:00:00+01:00");
    assert.deepEqual(call.cutOffs, []);
  });
});

describe("filterWindow", () => {
  const calls = () => apapa()[0].calls;

  it("keeps calls at the port on any day of the window", () => {
    const names = filterWindow(calls(), "2026-10-19", 3).map(
      (c) => c.vessel?.name,
    );
    // Arrived 19 Oct, still alongside until 23 Oct
    assert.ok(names.includes("MAERSK CASABLANCA"));
    // Arrives 21 Oct, the window's last day
    assert.ok(names.includes("MAERSK CARDIFF"));
    // Arrives 23 Oct, after the window
    assert.ok(!names.includes("MAERSK CUNENE"));
  });

  it("leaves out calls that departed before the window", () => {
    const names = filterWindow(calls(), "2026-10-24", 3).map(
      (c) => c.vessel?.name,
    );
    assert.ok(!names.includes("MAERSK CASABLANCA"));
  });

  it("returns more calls for more days", () => {
    assert.ok(
      filterWindow(calls(), "2026-10-19", 14).length >
        filterWindow(calls(), "2026-10-19", 7).length,
    );
  });
});

describe("toActivePorts", () => {
  it("maps, de-duplicates and sorts by country then port", () => {
    const ports = toActivePorts(fixture("active-ports-ng-cn"));
    assert.equal(ports.length, 22);
    assert.deepEqual(ports[0], {
      code: "CNDCB",
      name: "Da Chan Bay",
      countryCode: "CN",
      country: "China",
    });
    const nigeria = ports.filter((p) => p.countryCode === "NG");
    assert.deepEqual(
      nigeria.map((p) => p.code),
      ["NGAPP", "NGLKK", "NGONN", "NGTIN"],
    );
  });
});

// Real point-to-point responses, departing 19 Oct to 13 Dec 2026
const NAMES = { MYTPP: "Tanjung Pelepas", CNSHA: "Shanghai", NGAPP: "Apapa" };
const routes = (name: string) =>
  toRoutes(fixture<MaerskRoute[]>(name), NAMES);

describe("toRoutes", () => {
  it("maps a two-vessel route with its stops, vessels and cut-offs", () => {
    const route = routes("route-cnsha-ngapp").find(
      (r) => r.legs[0].vessel?.name === "ESSEN EXPRESS",
    );
    assert.equal(route.departs.code, "CNSHA");
    assert.equal(route.departs.name, "Shanghai");
    assert.equal(route.departs.terminal, "YANGSHAN SGH GUANDONG TERMINAL");
    assert.equal(route.departs.at, "2026-10-20T12:30:00+08:00");
    assert.equal(route.arrives.terminal, "Apapa Port");
    assert.equal(route.transitDays, 33);
    assert.deepEqual(route.legs[0].vessel, {
      name: "ESSEN EXPRESS",
      imo: "9501370",
      flag: "LR",
      callSign: "5LVY4",
    });
    assert.equal(route.legs[0].service, "AE3");
    assert.equal(route.legs[0].voyage, "641W");
    assert.equal(route.legs[1].from.name, "Tanjung Pelepas");
    assert.equal(route.legs[1].vessel?.name, "ALS FIDES");
    assert.deepEqual(
      route.cutOffs.map((c) => c.code).sort(),
      ["DCO", "ECP", "FCO", "VCO"],
    );
  });

  it("keeps a barge leg, with no vessel", () => {
    const barge = routes("route-cnngb-ngtin")
      .flatMap((r) => r.legs)
      .find((l) => l.mode === "BARGE");
    assert.equal(barge.vessel, null);
    assert.equal(barge.from.code, "NGAPP");
    assert.equal(barge.to.code, "NGTIN");
  });

  it("orders legs and falls back to the terminal for unknown ports", () => {
    const route = routes("route-nlrtm-ngonn")[0];
    assert.deepEqual(
      route.legs.map((l) => l.from.code),
      ["NLRTM", "ESALG", "CIABJ"],
    );
    // ESALG isn't in NAMES: the terminal name stands in
    assert.equal(route.legs[1].from.name, route.legs[1].from.terminal);
    assert.ok(route.cutOffs.some((c) => c.code === "DGC"));
  });
});

describe("routesInWindow", () => {
  const all = () => routes("route-cnsha-ngapp");

  it("keeps departures in the four weeks from the date", () => {
    const days = routesInWindow(all(), "departing", "2026-10-25").map((r) =>
      r.departs.at.slice(0, 10),
    );
    assert.ok(days.length > 0);
    assert.ok(days.every((d) => d >= "2026-10-25" && d < "2026-11-22"));
  });

  it("keeps arrivals in the four weeks up to the date", () => {
    const days = routesInWindow(all(), "arriving", "2026-12-10").map((r) =>
      r.arrives.at.slice(0, 10),
    );
    assert.deepEqual(days, [
      "2026-11-22",
      "2026-11-22",
      "2026-11-22",
      "2026-11-29",
      "2026-12-06",
    ]);
  });
});
