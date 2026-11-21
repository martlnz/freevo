"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { badgeBase, confirmationClass, confirmationLabel } from "./shared";

export function ConfirmationBadge({ status }: { status: string | null | undefined }) {
  return <span className={`${badgeBase} ${confirmationClass(status)}`}>{confirmationLabel(status)}</span>;
}

export function ConfirmLinkActions({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/c/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Sao chép link xác nhận:", url);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {copied ? <Check /> : <Copy />}
        {copied ? "Đã sao chép" : "Copy link"}
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={`/c/${token}`} target="_blank" rel="noreferrer">
          <ExternalLink />
          Mở trang khách
        </a>
      </Button>
    </span>
  );
}
