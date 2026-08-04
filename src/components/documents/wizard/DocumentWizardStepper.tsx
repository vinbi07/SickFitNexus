export type WizardStepperStep = {
  id: string;
  label: string;
};

export function DocumentWizardStepper({
  steps,
  currentStepIndex,
  invalidStepIds,
  onSelectStep,
}: {
  steps: WizardStepperStep[];
  currentStepIndex: number;
  invalidStepIds?: Set<string>;
  onSelectStep: (index: number) => void;
}) {
  return (
    <div className="wizard-steps" role="tablist" aria-label="Document creation steps">
      {steps.map((step, index) => (
        <button
          key={step.id}
          type="button"
          role="tab"
          aria-selected={index === currentStepIndex}
          className={`wizard-step${index === currentStepIndex ? " is-active" : ""}${index < currentStepIndex ? " is-done" : ""}`}
          onClick={() => onSelectStep(index)}
        >
          <span className="wizard-step-number">{index + 1}</span>
          <span className="wizard-step-label">{step.label}</span>
          {invalidStepIds?.has(step.id) ? (
            <span className="wizard-step-error-dot" title="This step needs attention">
              !
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
