export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 sm:px-6">
          <span className="text-lg font-semibold tracking-tight text-accent">freevo</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
