export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center px-4 sm:px-10">
          <span className="text-lg font-semibold tracking-tight text-accent">freevo</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-10 sm:py-10">{children}</main>
    </div>
  );
}
