import { AppShell } from "@/components/AppShell";
import { NewClientForm } from "@/components/clients/NewClientForm";
import type { ClientFormDefaults } from "@/components/clients/ClientFormFields";
import Link from "next/link";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim() : "";
}

function buildDefaults(email: string, contact: string, name: string): ClientFormDefaults {
  const defaults: ClientFormDefaults = {};
  if (name) defaults.name = name;

  if (email) {
    defaults.emails = email;
  } else if (contact.includes("@")) {
    defaults.emails = contact;
  } else if (contact) {
    const digits = contact.replace(/\D/g, "");
    if (digits.length >= 8) {
      defaults.phone = contact;
    } else if (!defaults.name) {
      defaults.name = contact;
    }
  }
  return defaults;
}

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; contact?: string; name?: string }>;
}) {
  const sp = await searchParams;
  const defaults = buildDefaults(first(sp.email), first(sp.contact), first(sp.name));

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
      <NewClientForm defaults={defaults} />
    </AppShell>
  );
}
