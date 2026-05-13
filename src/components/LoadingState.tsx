export function LoadingState({ message = "Loading operational data..." }: { message?: string }) {
  return <div className="loading-state">{message}</div>;
}
