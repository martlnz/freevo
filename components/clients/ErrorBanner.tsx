export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-[10px] border border-remove/30 bg-remove-tint px-3 py-2 text-sm font-medium text-remove"
    >
      {message}
    </div>
  );
}
