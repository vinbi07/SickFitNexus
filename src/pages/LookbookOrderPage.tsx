import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { LookbookExperience, type LookbookBuyerProfileDraft } from "@/components/LookbookExperience";
import { useAsyncData } from "@/hooks/useAsyncData";
import { buyerService } from "@/services/buyerService";
import { lookbookOrderService } from "@/services/lookbookOrderService";
import type { LookbookOrderInputLine, PurchaseOrder } from "@/types/domain";
import { getErrorMessage } from "@/utils/errors";

export function LookbookOrderPage() {
  const { token = "" } = useParams();
  const { data, loading, error, reload } = useAsyncData(() => lookbookOrderService.loadByToken(token), [token]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [quantityWarnings, setQuantityWarnings] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<"draft" | "quote" | "submit" | null>(null);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState<PurchaseOrder | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [hydratedDraftId, setHydratedDraftId] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<LookbookBuyerProfileDraft | null>(null);
  const [hydratedProfileForBuyerId, setHydratedProfileForBuyerId] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!data?.existingDraft?.id || hydratedDraftId === data.existingDraft.id) return;
    const nextQuantities = data.existingDraftLineItems.reduce<Record<string, number>>((accumulator, line) => {
      if (line.product_id) {
        accumulator[line.product_id] = Number(line.case_quantity ?? 0);
      }
      return accumulator;
    }, {});
    setQuantities(nextQuantities);
    setNotes(data.existingDraft.buyer_notes ?? data.existingDraft.notes ?? "");
    setHydratedDraftId(data.existingDraft.id);
  }, [data, hydratedDraftId]);

  useEffect(() => {
    if (!data?.buyer?.id || hydratedProfileForBuyerId === data.buyer.id) return;
    setProfileDraft({
      company_name: data.buyer.company_name ?? "",
      buyer_name: data.buyer.buyer_name ?? "",
      buyer_email: data.buyer.buyer_email ?? "",
      phone: data.buyer.phone ?? "",
      shipping_address: data.buyer.shipping_address ?? "",
      billing_address: data.buyer.billing_address ?? "",
    });
    setHydratedProfileForBuyerId(data.buyer.id);
  }, [data, hydratedProfileForBuyerId]);

  async function persistProfile() {
    if (!data || !profileDraft) return;
    await buyerService.upsert({ ...data.buyer, ...profileDraft });
  }

  async function handleSaveProfile() {
    try {
      setSavingProfile(true);
      await persistProfile();
      setNotice({ tone: "success", message: "Your information has been saved." });
      await reload();
    } catch (err) {
      setNotice({ tone: "error", message: getErrorMessage(err) });
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load this lookbook"} />;

  const accentColor = data.retailer.brand_accent_color ?? "#344054";

  async function handleSave(action: "draft" | "quote" | "submit") {
    try {
      setBusyAction(action);
      setNotice(null);
      const activeData = data;
      if (!activeData) throw new Error("Lookbook data is unavailable.");
      await persistProfile();
      const lines: LookbookOrderInputLine[] = Object.entries(quantities)
        .filter(([, caseQty]) => Number(caseQty) > 0)
        .map(([productId, requested_case_quantity]) => {
          const product = activeData.products.find((entry) => entry.id === productId);
          return {
            product_id: productId,
            sku: product?.sku ?? "",
            requested_case_quantity: Number(requested_case_quantity),
          };
        });
      const po = await lookbookOrderService.save(token, lines, action, notes);
      if (action === "submit") {
        setSubmitted(po);
      } else {
        setNotice({
          tone: "success",
          message: action === "quote" ? "Quote request saved and queued for review." : "Draft saved successfully.",
        });
      }
      await reload();
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Unable to save your order.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  if (submitted) {
    return (
      <div className="lookbook-shell" style={{ ["--lookbook-accent" as never]: accentColor }}>
        <div className="lookbook-confirmation card">
          <div className="lookbook-confirmation-mark">OK</div>
          <h1>Order submitted</h1>
          <p>Your SickFit purchase order has been received and routed for approval.</p>
          <strong>{submitted.po_number}</strong>
          <span>A confirmation notice has been queued for email delivery.</span>
        </div>
      </div>
    );
  }

  if (data.expired) {
    return (
      <div className="lookbook-shell" style={{ ["--lookbook-accent" as never]: accentColor }}>
        <div className="lookbook-hero">
          <div>
            <p className="lookbook-kicker">{data.retailer.name} | Buyer showroom</p>
            <h1>SickFit Wholesale Lookbook</h1>
            <span>This link has expired. Contact SickFit for a refreshed buyer link.</span>
          </div>
        </div>
        <div className="lookbook-confirmation card">
          <div className="lookbook-confirmation-mark">!</div>
          <h1>Link expired</h1>
          <p>{data.retailer.lookbook_intro ?? "This personalized wholesale showroom is no longer active."}</p>
        </div>
      </div>
    );
  }

  return (
    <LookbookExperience
      mode="live"
      retailer={data.retailer}
      buyer={data.buyer}
      products={data.products}
      existingDraft={data.existingDraft}
      counterEvents={data.counterEvents}
      quantities={quantities}
      setQuantities={setQuantities}
      quantityWarnings={quantityWarnings}
      setQuantityWarnings={setQuantityWarnings}
      notes={notes}
      onNotesChange={setNotes}
      notice={notice}
      onDismissNotice={() => setNotice(null)}
      busyAction={busyAction}
      onSubmit={(action) => void handleSave(action)}
      profile={profileDraft ?? undefined}
      onProfileChange={(field, value) =>
        setProfileDraft((current) => (current ? { ...current, [field]: value } : current))
      }
      onSaveProfile={() => void handleSaveProfile()}
      savingProfile={savingProfile}
    />
  );
}
