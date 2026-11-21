export const formatVND = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} ₫`;

export function MoneyBlock({ subtotal, taxRate = 0.1 }: { subtotal: number; taxRate?: number }) {
  const tax = Math.round(subtotal * taxRate);
  const total = subtotal + tax;
  return (
    <dl className="rounded-[10px] border border-hairline bg-surface p-4">
      <div className="flex justify-between gap-4 py-1">
        <dt className="text-muted">Tạm tính</dt>
        <dd className="tabular">{formatVND(subtotal)}</dd>
      </div>
      <div className="flex justify-between gap-4 py-1">
        <dt className="text-muted">Thuế VAT {Math.round(taxRate * 100)}%</dt>
        <dd className="tabular">{formatVND(tax)}</dd>
      </div>
      <div className="mt-2 flex justify-between gap-4 border-t border-hairline pt-3">
        <dt className="font-semibold">Tổng cộng</dt>
        <dd className="tabular text-xl font-semibold text-accent">{formatVND(total)}</dd>
      </div>
    </dl>
  );
}
