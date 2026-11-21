import type { SerializedMessage } from "./types";

const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function channelLabel(channel: string): string {
  if (channel === "zalo") return "Zalo";
  if (channel === "gmail") return "Gmail";
  return "Thủ công";
}

function channelClass(channel: string): string {
  if (channel === "zalo") return "bg-[#e6f0fb] text-[#1d5fa8]";
  if (channel === "gmail") return "bg-remove-tint text-remove";
  return "bg-ground text-muted";
}

export function EvidenceBubble({
  message,
  checked,
  disabled,
  onToggle,
}: {
  message: SerializedMessage;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const isFreelancer = message.sender === "freelancer";
  const isUnknown = message.sender !== "client" && !isFreelancer;
  const senderLabel = isFreelancer ? "Freelancer" : isUnknown ? "Chưa rõ" : "Khách";

  const bubbleClass = isFreelancer
    ? "border-add/20 bg-add-tint/60"
    : isUnknown
      ? "border-dashed border-hairline bg-surface"
      : "border-hairline bg-ground";

  return (
    <div className={isFreelancer ? "flex justify-end" : "flex justify-start"}>
      <label
        className={`flex max-w-[90%] cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-2 sm:max-w-[80%] ${bubbleClass} ${
          disabled ? "cursor-default" : ""
        } ${checked ? "" : "opacity-70"}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Chọn bằng chứng từ ${senderLabel}`}
          className="mt-1 size-4 shrink-0 accent-[var(--forest)]"
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-ink">{senderLabel}</span>
            <span className={`rounded px-1.5 py-0.5 font-medium ${channelClass(message.channel)}`}>
              {channelLabel(message.channel)}
            </span>
            <span className="tabular text-muted">{timeFmt.format(new Date(message.sentAt))}</span>
          </span>
          <span className="mt-1 block whitespace-pre-wrap break-words text-sm text-ink">{message.text}</span>
        </span>
      </label>
    </div>
  );
}
