import type { OrderChainMilestone, ProductionStageName } from "@/types/domain";
import { diffInDays, shiftDays } from "@/utils/leadTime";

/** Order placed → delivered, in the words the team uses for each step. */
export const CHAIN_MILESTONES: Array<Pick<OrderChainMilestone, "stage" | "label" | "phase">> = [
  { stage: "Sent to vendor", label: "Order placed", phase: "wait" },
  { stage: "Paid", label: "Invoice paid", phase: "wait" },
  { stage: "In production", label: "Production started", phase: "wait" },
  { stage: "Packing", label: "Production finished", phase: "prod" },
  { stage: "Shipped", label: "Left the factory", phase: "pack" },
  { stage: "Labels created", label: "US labels created", phase: "ship" },
  { stage: "At US port", label: "Arrived in USA", phase: "ship" },
  { stage: "Received", label: "Delivered", phase: "recv" },
];

const PACE_TOLERANCE_DAYS = 2;

/**
 * Builds the milestone chain for one order. Steps not reached yet carry an
 * expected date, pushed out by however late the latest actual step ran
 * against its own plan. Steps that were skipped (an earlier gap before a
 * later actual date) carry no expectation.
 */
export function buildOrderChain(
  actual: Partial<Record<ProductionStageName, string | null>>,
  expected: Partial<Record<ProductionStageName, string>> = {},
): OrderChainMilestone[] {
  const chain = CHAIN_MILESTONES.map((milestone) => {
    const date = actual[milestone.stage] ?? null;
    return { ...milestone, date, expected: date ? null : (expected[milestone.stage] ?? null) };
  });

  let last = -1;
  chain.forEach((milestone, index) => {
    if (milestone.date) last = index;
  });

  let shift = 0;
  if (last >= 0) {
    for (let j = last; j >= 0; j -= 1) {
      const planned = expected[chain[j].stage];
      if (planned) {
        shift = diffInDays(chain[last].date!, planned);
        break;
      }
    }
  }

  chain.forEach((milestone, index) => {
    if (milestone.date) return;
    if (index < last) {
      milestone.expected = null;
      return;
    }
    if (!milestone.expected) return;
    let next = shiftDays(milestone.expected, shift);
    if (last >= 0 && next <= chain[last].date!) next = shiftDays(chain[last].date!, 1);
    milestone.expected = next;
  });

  return chain;
}

/**
 * Average days for each step (milestone i-1 → i) across orders where both
 * ends actually happened. Index 0 is "Order placed → Invoice paid".
 */
export function chainStepAverages(chains: OrderChainMilestone[][]): Array<number | null> {
  return CHAIN_MILESTONES.slice(1).map((_, step) => {
    const values = chains.flatMap((chain) => {
      const from = chain[step]?.date;
      const to = chain[step + 1]?.date;
      return from && to ? [diffInDays(to, from)] : [];
    });
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  });
}

export interface ChainGap {
  days: number;
  average: number | null;
  /** Only judged for steps that actually happened. */
  pace: "slow" | "fast" | null;
}

/** Days from the previous dated step for each milestone, compared with the usual pace. */
export function chainGaps(chain: OrderChainMilestone[], averages: Array<number | null>): Array<ChainGap | null> {
  let previous: string | null = null;
  return chain.map((milestone, index) => {
    const when = milestone.date ?? milestone.expected;
    let gap: ChainGap | null = null;
    if (when && previous && index > 0) {
      const days = diffInDays(when, previous);
      const average = averages[index - 1] ?? null;
      let pace: ChainGap["pace"] = null;
      if (milestone.date && average != null) {
        if (days > average + PACE_TOLERANCE_DAYS) pace = "slow";
        else if (days < average - PACE_TOLERANCE_DAYS) pace = "fast";
      }
      gap = { days, average, pace };
    }
    if (when) previous = when;
    return gap;
  });
}

/** One-line headline: total days for delivered orders, days so far for open ones. */
export function chainHeadline(chain: OrderChainMilestone[], today: string) {
  const first = chain.find((milestone) => milestone.date);
  if (!first) return null;
  const delivered = chain[chain.length - 1];
  if (delivered.date) {
    return { days: diffInDays(delivered.date, first.date!), text: `${first.label.toLowerCase()} to delivered`, eta: null };
  }
  return {
    days: diffInDays(today, first.date!),
    text: `since ${first.label.toLowerCase()}`,
    eta: delivered.expected,
  };
}
