import { DocumentTypeSelector } from "@/components/documents/DocumentTypeSelector";
import { PageHeader } from "@/components/PageHeader";

export function CreateDocumentPage() {
  return (
    <div className="section-stack">
      <PageHeader
        title="Create a Document"
        description="Choose what you're creating. Each option walks you through the details step by step."
      />
      <DocumentTypeSelector />
    </div>
  );
}
