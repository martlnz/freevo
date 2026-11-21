import Link from "next/link";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-accent hover:opacity-90">
            freevo
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/" className="text-muted transition-colors hover:text-ink">
              Khách hàng
            </Link>
            <Link href="/inbox" className="text-muted transition-colors hover:text-ink">
              Chưa phân loại
            </Link>
            <Link
              href="/clients/new"
              className="inline-flex h-9 items-center rounded-[10px] border border-hairline bg-surface px-3 text-ink transition-colors hover:bg-ground"
            >
              + Khách mới
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
