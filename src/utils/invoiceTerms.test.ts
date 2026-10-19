import { describe, expect, it } from "vitest";
import { computeDueDate, formatTermsLabel, parseNetDays } from "@/utils/invoiceTerms";

describe("invoice terms", () => {
  it("parses the common net-terms spellings", () => {
    expect(parseNetDays("NT30 Net due in 30 days")).toBe(30);
    expect(parseNetDays("Net 30")).toBe(30);
    expect(parseNetDays("net45")).toBe(45);
    expect(parseNetDays("Due in 60 days")).toBe(60);
    expect(parseNetDays("Due on receipt")).toBeNull();
    expect(parseNetDays(null)).toBeNull();
  });

  it("computes the due date from the invoice date", () => {
    expect(computeDueDate("2026-10-02", "NT30 Net due in 30 days")).toBe("2026-11-01");
    expect(computeDueDate("2026-10-05", "Net 30")).toBe("2026-11-04");
    expect(computeDueDate(null, "Net 30")).toBeNull();
  });

  it("formats a short terms label", () => {
    expect(formatTermsLabel("NT30 Net due in 30 days")).toBe("Net 30");
    expect(formatTermsLabel("Due on receipt")).toBe("Due on receipt");
  });
});
