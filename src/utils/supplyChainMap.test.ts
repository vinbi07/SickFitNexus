import { describe, expect, it } from "vitest";
import { MAP_PLACES } from "@/lib/mapPlaces";
import { fanOut, orderMapPosition, stageTone, type SupplyChainMapOrder } from "@/utils/supplyChainMap";

const base: SupplyChainMapOrder = {
  poId: "po-1",
  poNumber: "MO-1",
  account: "MO-1",
  manufacturer: "Factory",
  units: 2400,
  shipMode: "Sea",
  stage: "Paid",
  shippedDate: null,
  expectedAtPort: null,
  nextStage: "In production",
  nextStageDate: null,
  late: false,
  chain: [],
};

describe("stageTone", () => {
  it("groups stages into map colors", () => {
    expect(stageTone(null)).toBe("waiting");
    expect(stageTone("Sent to vendor")).toBe("waiting");
    expect(stageTone("Packing")).toBe("production");
    expect(stageTone("At US port")).toBe("transit");
    expect(stageTone("Received")).toBe("received");
  });
});

describe("orderMapPosition", () => {
  it("keeps unshipped orders at the factory", () => {
    const position = orderMapPosition(base, "2026-07-01");
    expect(position.coordinates).toEqual(MAP_PLACES.factory.coordinates);
    expect(position.where).toBe("At the factory, in production");
  });

  it("places shipped sea orders partway across the Pacific", () => {
    const order = { ...base, stage: "Shipped" as const, shippedDate: "2026-07-01", expectedAtPort: "2026-08-05" };
    const position = orderMapPosition(order, "2026-07-18");
    expect(position.fraction).toBeCloseTo(17 / 35);
    expect(position.origin).toEqual(MAP_PLACES.seaPort.coordinates);
    expect(position.where).toBe("On the water, about 49% of the way");
  });

  it("uses the air leg for air orders and clamps the fraction", () => {
    const order = {
      ...base,
      shipMode: "Air" as const,
      stage: "Shipped" as const,
      shippedDate: "2026-07-01",
      expectedAtPort: "2026-07-11",
    };
    expect(orderMapPosition(order, "2026-07-30").fraction).toBe(0.96);
    expect(orderMapPosition(order, "2026-06-20").fraction).toBe(0.04);
    expect(orderMapPosition(order, "2026-07-05").origin).toEqual(MAP_PLACES.airPort.coordinates);
  });

  it("defaults to halfway when transit dates are missing", () => {
    expect(orderMapPosition({ ...base, stage: "Shipped" }, "2026-07-05").fraction).toBe(0.5);
  });

  it("puts orders with US labels at the arrival point", () => {
    const position = orderMapPosition({ ...base, shipMode: "Air", stage: "Labels created" }, "2026-08-01");
    expect(position.coordinates).toEqual(MAP_PLACES.usAirPort.coordinates);
    expect(position.where).toBe("Landed, US labels made, waiting on the carrier");
  });

  it("puts port and received orders at their places", () => {
    expect(orderMapPosition({ ...base, stage: "At US port" }, "2026-08-01").coordinates).toEqual(
      MAP_PLACES.usSeaPort.coordinates,
    );
    expect(orderMapPosition({ ...base, stage: "Received" }, "2026-08-10").coordinates).toEqual(
      MAP_PLACES.warehouse.coordinates,
    );
  });
});

describe("fanOut", () => {
  it("spreads markers that share a point", () => {
    const spread = fanOut([
      { item: "a", point: [100, 100] },
      { item: "b", point: [100, 100] },
      { item: "c", point: [300, 50] },
    ]);
    expect(spread.find((entry) => entry.item === "c")?.point).toEqual([300, 50]);
    const [a, b] = spread.filter((entry) => entry.item !== "c");
    expect(a.point).not.toEqual(b.point);
  });
});
