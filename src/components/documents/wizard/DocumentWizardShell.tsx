import { useState, type ReactNode } from "react";
import { InlineErrorLog } from "@/components/InlineErrorLog";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import type { UiErrorLog } from "@/utils/errors";
import { DocumentWizardStepper, type WizardStepperStep } from "./DocumentWizardStepper";
import { WizardNavigation } from "./WizardNavigation";

export function DocumentWizardShell({
  title,
  description,
  steps,
  currentStepIndex,
  invalidStepIds,
  onSelectStep,
  onBack,
  onNext,
  onSaveDraft,
  onSubmit,
  nextDisabled,
  isLastStep,
  submitting,
  submitLabel,
  notice,
  onDismissNotice,
  error,
  draftRestored,
  onDiscardDraft,
  cancelHref,
  children,
}: {
  title: string;
  description: string;
  steps: WizardStepperStep[];
  currentStepIndex: number;
  invalidStepIds?: Set<string>;
  onSelectStep: (index: number) => void;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  nextDisabled: boolean;
  isLastStep: boolean;
  submitting: boolean;
  submitLabel: string;
  notice?: { tone: "success" | "error"; message: string } | null;
  onDismissNotice?: () => void;
  error?: UiErrorLog | null;
  draftRestored?: boolean;
  onDiscardDraft?: () => void;
  cancelHref: string;
  children: ReactNode;
}) {
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);

  return (
    <div className="section-stack">
      <PageHeader
        title={title}
        description={description}
        actions={
          <div className="btn-row">
            {draftRestored && onDiscardDraft ? (
              <button type="button" className="btn btn-ghost" onClick={onDiscardDraft}>
                Discard Draft
              </button>
            ) : null}
            <a
              className="btn btn-ghost"
              href={cancelHref}
              onClick={(event) => {
                if (
                  !window.confirm(
                    "Leave without finishing? Your progress is autosaved on this device, but you'll need to come back here to continue.",
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
              Cancel
            </a>
          </div>
        }
      />

      {draftRestored && !draftBannerDismissed ? (
        <NotificationBanner
          tone="success"
          message="We restored your saved draft. Continue where you left off, or use Discard Draft to start fresh."
          onClose={() => setDraftBannerDismissed(true)}
        />
      ) : null}

      {notice ? (
        <NotificationBanner tone={notice.tone} message={notice.message} onClose={onDismissNotice} />
      ) : null}

      {error ? <InlineErrorLog error={error} /> : null}

      <div className="panel section-stack">
        <DocumentWizardStepper
          steps={steps}
          currentStepIndex={currentStepIndex}
          invalidStepIds={invalidStepIds}
          onSelectStep={onSelectStep}
        />

        <div className="wizard-step-panel">{children}</div>

        <WizardNavigation
          onBack={onBack}
          onNext={onNext}
          onSaveDraft={onSaveDraft}
          onSubmit={onSubmit}
          backDisabled={currentStepIndex === 0}
          nextDisabled={nextDisabled}
          isLastStep={isLastStep}
          submitting={submitting}
          submitLabel={submitLabel}
        />
      </div>
    </div>
  );
}
