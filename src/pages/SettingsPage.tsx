import { useEffect } from "react";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { FileUploadCell } from "@/components/orders/FileUploadCell";
import { useAsyncData } from "@/hooks/useAsyncData";
import { supportService } from "@/services/supportService";
import type { AppSettings } from "@/types/domain";
import { useState } from "react";
import { getErrorMessage } from "@/utils/errors";
import { DEFAULT_LOGO_URL } from "@/lib/branding";

export function SettingsPage() {
  const { data, loading, error, reload } = useAsyncData(() => supportService.listSettings(), []);
  const settings = data?.[0];
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Partial<AppSettings> | null>(null);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.style.setProperty("--brand-primary", settings.primary_color);
    document.documentElement.style.setProperty("--brand-secondary", settings.secondary_color);
  }, [settings]);

  useEffect(() => {
    if (!settings) return;
    setFormValues(settings);
  }, [settings]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load settings"} />;
  if (!settings) return <ErrorState message="No settings record found. Seed app_settings first." />;
  if (!formValues) return <LoadingState message="Preparing branding settings..." />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Branding Settings"
        description="Adjust the app name, organization label, logo, primary UI colors, and dashboard comparison baseline with a live preview."
      />
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Edit Branding</h3>
          </div>
          <div className="form-grid">
            <div className="field field-half">
              <label>App Name</label>
              <input
                value={formValues.app_name ?? ""}
                onChange={(event) =>
                  setFormValues((current) => ({ ...(current ?? {}), app_name: event.target.value }))
                }
              />
            </div>
            <div className="field field-half">
              <label>Organization Name</label>
              <input
                value={formValues.organization_name ?? ""}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...(current ?? {}),
                    organization_name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="field field-wide">
              <label>Logo</label>
              <div className="image-field">
                <FileUploadCell
                  className="mfr-upload-cell--product"
                  value={formValues.logo_url ?? DEFAULT_LOGO_URL}
                  folder="branding"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  label="Logo"
                  onChange={(url) =>
                    setFormValues((current) => ({ ...(current ?? {}), logo_url: url }))
                  }
                />
                <input
                  type="text"
                  placeholder="Or paste an image URL"
                  value={formValues.logo_url ?? DEFAULT_LOGO_URL}
                  onChange={(event) =>
                    setFormValues((current) => ({ ...(current ?? {}), logo_url: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="field field-half">
              <label>Primary Color</label>
              <input
                type="color"
                value={formValues.primary_color ?? "#e72027"}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...(current ?? {}),
                    primary_color: event.target.value,
                  }))
                }
              />
            </div>
            <div className="field field-half">
              <label>Secondary Color</label>
              <input
                type="color"
                value={formValues.secondary_color ?? "#111111"}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...(current ?? {}),
                    secondary_color: event.target.value,
                  }))
                }
              />
            </div>
            <div className="field field-half">
              <label>Prior YTD Revenue</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formValues.prior_ytd_revenue ?? 0}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...(current ?? {}),
                    prior_ytd_revenue: Number(event.target.value || 0),
                  }))
                }
              />
            </div>
          </div>
          <div className="btn-row">
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={async () => {
                try {
                  setSaving(true);
                  setSaveMessage(null);
                  await supportService.saveSettings({ ...settings, ...formValues });
                  await reload();
                  setSaveMessage("Branding settings saved.");
                } catch (saveError) {
                  setSaveMessage(getErrorMessage(saveError));
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
            <button
              className="btn btn-secondary"
              disabled={saving}
              onClick={() => {
                setFormValues(settings);
                setSaveMessage("Changes reset to last saved values.");
              }}
            >
              Reset
            </button>
          </div>
          {saveMessage ? (
            <p className={saveMessage.includes("saved") ? "success-text" : "danger-text"}>
              {saveMessage}
            </p>
          ) : null}
        </div>
        <div className="panel">
          <h3>Live Preview</h3>
          <div
            className="color-preview"
            style={{
              background: `linear-gradient(135deg, ${formValues.secondary_color ?? settings.secondary_color}, ${formValues.primary_color ?? settings.primary_color})`,
            }}
          >
            <img
              src={formValues.logo_url ?? settings.logo_url ?? DEFAULT_LOGO_URL}
              alt={formValues.app_name ?? settings.app_name}
              className="settings-preview-logo"
            />
            <h2>{formValues.app_name ?? settings.app_name}</h2>
            <p>{formValues.organization_name ?? settings.organization_name}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
