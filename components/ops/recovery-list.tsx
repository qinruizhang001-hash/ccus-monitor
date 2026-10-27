export function RecoveryList({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs leading-5">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}
