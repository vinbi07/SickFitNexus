import { describe, expect, it } from "vitest";
import { getPoTargetDate } from "./operations";

const base = { eta_date: null, expected_delivery_date: null, ship_complete_date: "2026-10-12", start_ship_date: null };

describe("getPoTargetDate", () => {
  it("shows the ship-by date until the order ships", () => {
    expect(getPoTargetDate(base)).toEqual({ label: "Ship by", date: "2026-10-12" });
  });

  it("switches to the actual ship date once shipped", () => {
    expect(getPoTargetDate({ ...base, ship_date: "2026-10-08" })).toEqual({ label: "Shipped", date: "2026-10-08" });
  });

  it("still prefers an ETA", () => {
    expect(getPoTargetDate({ ...base, eta_date: "2026-10-20", ship_date: "2026-10-08" })).toEqual({
      label: "ETA",
      date: "2026-10-20",
    });
  });
});
