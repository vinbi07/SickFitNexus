import { StatusBadge } from "@/components/StatusBadge";
import type { Buyer, PurchaseOrder } from "@/types/domain";
import { getLookbookStatusLabel } from "@/utils/lookbook";

export function LookbookStatusBadge({
  buyer,
  purchaseOrders,
}: {
  buyer: Pick<Buyer, "token_expires_at" | "last_accessed_at" | "lookbook_status">;
  purchaseOrders: Array<Pick<PurchaseOrder, "source_channel" | "status">>;
}) {
  return <StatusBadge label={getLookbookStatusLabel(buyer, purchaseOrders)} />;
}
