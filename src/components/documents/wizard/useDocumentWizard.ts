import { useReducer, useState } from "react";
import { clearWizardDraft, loadWizardDraft, useWizardAutosave } from "@/state/wizardAutosave";
import type { WizardStepperStep } from "./DocumentWizardStepper";

export type WizardStepDef<State> = WizardStepperStep & {
  isValid: (state: State) => boolean;
};

/**
 * Shared creation-wizard state machine: one reducer-backed state object per
 * wizard (never a second untracked useState for "the other half" of the
 * document), debounced localStorage autosave, and step-position resume based
 * on re-running each step's isValid() against the restored draft rather than
 * persisting a possibly-stale step index.
 */
export function useDocumentWizard<State, Action>({
  storageKey,
  reducer,
  createInitialState,
  steps,
}: {
  storageKey: string;
  reducer: (state: State, action: Action) => State;
  createInitialState: () => State;
  steps: WizardStepDef<State>[];
}) {
  const [{ state: initialState, restoredFromDraft }] = useState(() => {
    const draft = loadWizardDraft<State>(storageKey);
    return draft
      ? { state: draft, restoredFromDraft: true }
      : { state: createInitialState(), restoredFromDraft: false };
  });

  const [state, dispatch] = useReducer(reducer, initialState);

  const [currentStepIndex, setCurrentStepIndex] = useState(() => {
    if (!restoredFromDraft) return 0;
    const firstInvalidIndex = steps.findIndex((step) => !step.isValid(initialState));
    return firstInvalidIndex === -1 ? steps.length - 1 : firstInvalidIndex;
  });

  const [draftDismissed, setDraftDismissed] = useState(false);

  useWizardAutosave(storageKey, state, { enabled: true });

  const currentStep = steps[currentStepIndex];
  const canGoNext = currentStep ? currentStep.isValid(state) : false;
  const isLastStep = currentStepIndex === steps.length - 1;

  const invalidStepIds = new Set(
    steps.filter((step) => !step.isValid(state)).map((step) => step.id),
  );

  const goNext = () => setCurrentStepIndex((index) => Math.min(steps.length - 1, index + 1));
  const goBack = () => setCurrentStepIndex((index) => Math.max(0, index - 1));
  const goToStep = (index: number) =>
    setCurrentStepIndex(Math.max(0, Math.min(steps.length - 1, index)));

  const discardDraft = (resetState: () => void) => {
    clearWizardDraft(storageKey);
    setDraftDismissed(true);
    setCurrentStepIndex(0);
    resetState();
  };

  const markSubmitted = () => {
    clearWizardDraft(storageKey);
  };

  return {
    state,
    dispatch,
    steps,
    currentStepIndex,
    currentStep,
    canGoNext,
    isLastStep,
    invalidStepIds,
    goNext,
    goBack,
    goToStep,
    draftRestored: restoredFromDraft && !draftDismissed,
    discardDraft,
    markSubmitted,
  };
}
