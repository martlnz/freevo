import { db } from "./db";
import type { Pricing } from "./types";

const round100k = (n: number) => Math.round(n / 100000) * 100000;

export async function getPricing(clientId: string, prId?: string): Promise<Pricing> {
  const taxRate = Number(process.env.TAX_RATE ?? "0.1");
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Không tìm thấy khách hàng.");
  const past = await db.pastProject.findMany({ where: { clientId } });
  const unitPrice = past.length ? past.reduce((s, p) => s + p.price / Math.max(p.hours, 1), 0) / past.length : 0;
  const merged = await db.pullRequest.findMany({ where: { clientId, status: "merged" } });
  const currentEffort = client.baseEffort + merged.reduce((s, p) => s + p.effortDelta, 0);
  let delta = 0;
  if (prId) {
    const pr = await db.pullRequest.findUnique({ where: { id: prId } });
    if (pr && pr.status === "open") delta = pr.effortDelta;
  }
  const proposedEffort = currentEffort + delta;
  const suggestedPrice = round100k(proposedEffort * unitPrice);
  const net = (p: number) => Math.round(p * (1 - taxRate));
  return {
    contractPrice: client.contractPrice,
    unitPrice,
    currentEffort,
    proposedEffort,
    suggestedPrice,
    netCurrent: net(client.contractPrice),
    netSuggested: net(suggestedPrice),
    taxRate,
    priceForNet: (x: number) => Math.ceil(x / (1 - taxRate) / 100000) * 100000,
  };
}
