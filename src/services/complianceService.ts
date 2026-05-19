import { assertSupabase } from "@/lib/supabase";
import { insertTable, upsertTable } from "@/services/baseService";
import type {
  ComplianceSnapshot,
  ComplianceRequirementType,
  Product,
  Buyer,
  RetailerComplianceDocument,
  RetailerComplianceRequirement,
} from "@/types/domain";
import { buildComplianceSnapshot } from "@/utils/lookbook";

export const complianceService = {
  async listRequirementTypes() {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("compliance_requirement_types")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ComplianceRequirementType[];
  },

  async listRequirements() {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("retailer_compliance_requirements")
      .select("*, retailers(*), requirement_types:compliance_requirement_types(*)")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as RetailerComplianceRequirement[];
  },

  async listDocuments() {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("retailer_compliance_documents")
      .select("*")
      .order("uploaded_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as RetailerComplianceDocument[];
  },

  async upsertRequirement(payload: Partial<RetailerComplianceRequirement>) {
    const [saved] = (await upsertTable<RetailerComplianceRequirement>(
      "retailer_compliance_requirements",
      payload,
    )) as RetailerComplianceRequirement[];
    return saved;
  },

  async saveDocument(payload: Partial<RetailerComplianceDocument>) {
    const [saved] = (await insertTable<RetailerComplianceDocument>(
      "retailer_compliance_documents",
      payload,
    )) as RetailerComplianceDocument[];
    return saved;
  },

  async getMatrix() {
    const [requirements, documents] = await Promise.all([
      this.listRequirements(),
      this.listDocuments(),
    ]);

    return requirements.map((requirement) => ({
      ...requirement,
      documents: documents.filter((document) => document.retailer_requirement_id === requirement.id),
    }));
  },

  async buildSnapshotForBuyerOrder(buyer: Buyer, products: Product[]): Promise<ComplianceSnapshot> {
    const requirements = await this.listRequirements();
    return buildComplianceSnapshot({
      buyer,
      retailerRequirementStatuses: requirements
        .filter((requirement) => requirement.retailer_id === buyer.retailer_id)
        .map((requirement) => ({
          requirementName: requirement.requirement_types?.name ?? "Compliance requirement",
          status: requirement.status,
        })),
      productRequirements: products.map((product) => ({
        productId: product.id,
        sku: product.sku,
        requiredDocs: product.compliance_docs_status === "Missing" ? product.compliance_docs_required : [],
      })),
    });
  },
};
