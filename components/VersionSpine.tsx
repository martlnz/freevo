export type SpineVersion = { no: number; note?: string; date?: string };

export function VersionSpine({
  versions,
  currentNo,
  openPR,
}: {
  versions: SpineVersion[];
  currentNo: number;
  openPR?: { title: string; onClick?: () => void };
}) {
  return (
    <ol className="relative flex flex-col">
      {openPR && (
        <li className="relative pb-5 pl-7">
          <span aria-hidden className="absolute left-[5px] top-2 h-full w-px border-l border-dashed border-accent" />
          <span aria-hidden className="absolute left-0 top-1.5 size-[11px] rounded-full border-2 border-dashed border-accent bg-surface" />
          <button
            type="button"
            onClick={openPR.onClick}
            className="min-h-[44px] -my-2 py-2 text-left text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            PR đang mở: {openPR.title}
          </button>
        </li>
      )}
      {versions.map((v, i) => {
        const current = v.no === currentNo;
        const last = i === versions.length - 1;
        return (
          <li key={v.no} className="relative pb-5 pl-7 last:pb-0">
            {!last && <span aria-hidden className="absolute left-[5px] top-3 h-full w-px bg-hairline" />}
            <span
              aria-hidden
              className={`absolute left-0 top-1.5 size-[11px] rounded-full border-2 ${
                current ? "border-accent bg-accent" : "border-muted bg-surface"
              }`}
            />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={`tabular text-sm ${current ? "font-semibold text-ink" : "font-medium text-muted"}`}>v{v.no}</span>
              {current && <span className="text-xs font-semibold text-accent">HIỆN TẠI</span>}
              {v.date && <span className="tabular text-xs text-muted">{v.date}</span>}
            </div>
            {v.note && <p className="break-words text-sm text-muted">{v.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}
