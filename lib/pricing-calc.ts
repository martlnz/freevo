export const formatVND = (n: number): string => `${Math.round(n).toLocaleString("vi-VN")} ₫`;

export function calcNet(price: number, taxRate: number): number {
  return Math.round(price * (1 - taxRate));
}

export function calcPriceForNet(desiredNet: number, taxRate: number): number {
  if (!(desiredNet > 0)) return 0;
  return Math.ceil(desiredNet / (1 - taxRate) / 100000) * 100000;
}
