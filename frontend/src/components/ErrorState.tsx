interface ErrorStateProps {
  message: string;
}

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <p className="text-lg font-medium text-neutral-200">Something went wrong</p>
      <p className="text-sm text-neutral-400">{message}</p>
    </div>
  );
}
