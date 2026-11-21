"use client";
import { useRouter } from "next/navigation";
import { VersionSpine, type SpineVersion } from "@/components/VersionSpine";

export function ClientSpine({ versions, currentNo, openPR }: { versions: SpineVersion[]; currentNo: number; openPR?: { id: string; title: string } }) {
  const router = useRouter();
  return (
    <VersionSpine
      versions={versions}
      currentNo={currentNo}
      openPR={openPR ? { title: openPR.title, onClick: () => router.push(`/pr/${openPR.id}`) } : undefined}
    />
  );
}
