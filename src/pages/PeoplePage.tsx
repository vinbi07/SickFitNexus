import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { useAsyncData } from "@/hooks/useAsyncData";
import { supportService } from "@/services/supportService";
import type { Person } from "@/types/domain";

export function PeoplePage() {
  const [editing, setEditing] = useState<Partial<Person> | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => supportService.listPeople(), []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load people directory"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="People Directory"
        description="Maintain mentors, vendor contacts, and operational experts with direct contact links."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ name: "" })}>Add Person</button>}
      />
      <DataTable
        columns={[
          { key: "name", title: "Name", render: (row) => row.name },
          { key: "role", title: "Role", render: (row) => row.role ?? "N/A" },
          { key: "company", title: "Company", render: (row) => row.company ?? "N/A" },
          { key: "expertise_tags", title: "Expertise", render: (row) => row.expertise_tags.join(", ") },
          { key: "email", title: "Contact", render: (row) => row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : "N/A" },
          { key: "calendar_url", title: "Calendar", render: (row) => row.calendar_url ? <a href={row.calendar_url} target="_blank" rel="noreferrer">Open</a> : "N/A" },
        ]}
        rows={data}
      />
      {editing ? (
        <EntityFormModal<Partial<Person>>
          title={editing.id ? "Edit Person" : "Add Person"}
          initialValues={{
            name: editing.name ?? "",
            role: editing.role ?? "",
            company: editing.company ?? "",
            email: editing.email ?? "",
            phone: editing.phone ?? "",
            calendar_url: editing.calendar_url ?? "",
            notes: editing.notes ?? "",
          }}
          fields={[
            { key: "name", label: "Name" },
            { key: "role", label: "Role" },
            { key: "company", label: "Company" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            { key: "calendar_url", label: "Calendar URL" },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          onSave={async (values) => {
            await supportService.savePerson({ ...editing, ...values, expertise_tags: editing.expertise_tags ?? [] });
            await reload();
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
