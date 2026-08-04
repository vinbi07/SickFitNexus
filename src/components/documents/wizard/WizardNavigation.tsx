export function WizardNavigation({
  onBack,
  onNext,
  onSaveDraft,
  onSubmit,
  backDisabled,
  nextDisabled,
  isLastStep,
  submitting,
  submitLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  backDisabled: boolean;
  nextDisabled: boolean;
  isLastStep: boolean;
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <div className="btn-row wizard-nav">
      <button
        type="button"
        className="btn btn-ghost"
        disabled={backDisabled || submitting}
        onClick={onBack}
      >
        Back
      </button>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={submitting}
          onClick={onSaveDraft}
        >
          Save Draft
        </button>
        {isLastStep ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting}
            onClick={onSubmit}
          >
            {submitting ? "Saving…" : submitLabel}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={nextDisabled || submitting}
            onClick={onNext}
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
