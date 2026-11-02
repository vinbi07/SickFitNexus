import { describe, expect, it } from "vitest";
import { buildOrderChain, chainGaps, chainHeadline, chainStepAverages } from "@/utils/orderChain";

describe("buildOrderChain", () => {
  it("lists all eight milestones in order", () => {
    const chain = buildOrderChain({});
    expect(chain.map((step) => step.label)).toEqual([
      "Order placed",
      "Invoice paid",
      "Production started",
      "Production finished",
      "Left the factory",
      "US labels created",
      "Arrived in USA",
      "Delivered",
    ]);
  });

  it("pushes expected dates out by how late the order is running", () => {
    const chain = buildOrderChain(
      { "Sent to vendor": "2026-05-01", Paid: "2026-05-10" },
      { Paid: "2026-05-05", Shipped: "2026-06-04", Received: "2026-07-20" },
    );
    // Paid landed 5 days after plan, so later steps slide 5 days.
    expect(chain[4].expected).toBe("2026-06-09");
    expect(chain[7].expected).toBe("2026-07-25");
  });

  it("drops expectations for steps that were skipped", () => {
    const chain = buildOrderChain(
      { "Sent to vendor": "2026-05-19", "Labels created": "2026-07-16", Received: "2026-08-04" },
      { Paid: "2026-05-25" },
    );
    expect(chain[1]).toMatchObject({ date: null, expected: null });
    expect(chain[6]).toMatchObject({ date: null, expected: null });
  });

  it("never expects a step before the latest actual one", () => {
    const chain = buildOrderChain({ Shipped: "2026-07-01" }, { Shipped: "2026-07-01", "At US port": "2026-06-20" });
    expect(chain[6].expected).toBe("2026-07-02");
  });
});

describe("averages, gaps and headline", () => {
  const delivered = buildOrderChain({
    "Sent to vendor": "2026-05-19",
    "Labels created": "2026-07-16",
    Received: "2026-08-04",
  });

  it("averages only consecutive steps that both happened", () => {
    const a = buildOrderChain({ "Labels created": "2026-07-10", "At US port": "2026-07-28" });
    const b = buildOrderChain({ "Labels created": "2026-07-01", "At US port": "2026-07-19" });
    const averages = chainStepAverages([a, b, delivered]);
    expect(averages[5]).toBe(18);
    expect(averages[0]).toBeNull();
  });

  it("measures each gap from the previous dated step and judges its pace", () => {
    // averages[i] is milestone i → i+1, so "US labels created" reads averages[4].
    const gaps = chainGaps(delivered, [null, null, null, null, 18, null, 18]);
    expect(gaps[5]).toEqual({ days: 58, average: 18, pace: "slow" });
    expect(gaps[7]).toEqual({ days: 19, average: 18, pace: null });
    expect(gaps[1]).toBeNull();
  });

  it("summarises delivered and open orders", () => {
    expect(chainHeadline(delivered, "2026-11-01")).toEqual({ days: 77, text: "order placed to delivered", eta: null });
    const open = buildOrderChain({ "Sent to vendor": "2026-10-01" }, { Received: "2026-12-01" });
    expect(chainHeadline(open, "2026-11-01")).toEqual({ days: 31, text: "since order placed", eta: "2026-12-01" });
    expect(chainHeadline(buildOrderChain({}), "2026-11-01")).toBeNull();
  });
});
