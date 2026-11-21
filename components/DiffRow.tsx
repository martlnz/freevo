import type { PRChange } from "@/lib/types";

type Kind = PRChange["op"];

const META: Record<Kind, { word: string; glyph: string; bar: string; tint: string; text: string }> = {
  add: { word: "THÊM", glyph: "+", bar: "bg-add", tint: "bg-add-tint", text: "text-add" },
  modify: { word: "SỬA", glyph: "~", bar: "bg-modify", tint: "bg-modify-tint", text: "text-modify" },
  remove: { word: "BỎ", glyph: "−", bar: "bg-remove", tint: "bg-remove-tint", text: "text-remove" },
};

export type DiffRowProps = {
  kind: Kind;
  title: string;
  before?: string;
  after?: string;
  delta?: string;
  selected: boolean;
  onSelect: () => void;
};

export function DiffRow({ kind, title, before, after, delta, selected, onSelect }: DiffRowProps) {
  const m = META[kind];
  const struck = kind === "remove";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative flex min-h-[44px] w-full items-stretch gap-3 overflow-hidden rounded-[10px] border py-3 pl-5 pr-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${m.tint} ${
        selected ? "border-accent" : "border-hairline"
      }`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${m.bar}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-2">
          <span aria-hidden className={`font-semibold ${m.text}`}>{m.glyph}</span>
          <span className={`text-xs font-semibold tracking-wide ${m.text}`}>{m.word}</span>
          <span className={`break-words font-medium ${struck ? "text-muted line-through" : "text-ink"}`}>{title}</span>
        </span>
        {kind === "modify" && (before || after) && (
          <span className="flex flex-col gap-0.5 break-words text-sm">
            {before && <span className="text-muted line-through">{before}</span>}
            {after && <span className="text-ink">{after}</span>}
          </span>
        )}
        {kind === "add" && after && <span className="break-words text-sm text-ink">{after}</span>}
        {kind === "remove" && before && <span className="break-words text-sm text-muted line-through">{before}</span>}
      </span>
      {delta && <span className={`tabular shrink-0 self-start text-sm font-medium ${m.text}`}>{delta}</span>}
    </button>
  );
}
