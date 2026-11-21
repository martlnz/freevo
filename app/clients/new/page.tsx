import { AppShell } from "@/components/AppShell";
import { NewClientForm } from "@/components/clients/NewClientForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NewClientPage() {
  return (
    <AppShell>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href="/" className="hover:text-ink">
          Khách hàng
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink">Tạo khách mới</span>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-ink">Tạo khách mới</h1>
      <NewClientForm />
    </AppShell>
  );
}
