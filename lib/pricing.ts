import { db } from "./db";
import { calcNet, calcPriceForNet } from "./pricing-calc";
import type { Pricing, SerializablePricing } from "./types";

const round100k = (n: number) => Math.round(n / 100000) * 100000;

export async function getSerializablePricing(clientId: string, prId?: string): Promise<SerializablePricing> {
  const taxRate = Number(process.env.TAX_RATE ?? "0.1");
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Không tìm thấy khách hàng.");
  let past = await db.pastProject.findMany({ where: { clientId } });
  if (past.length === 0) {
    past = await db.pastProject.findMany();
  }
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
  return {
    contractPrice: client.contractPrice,
    unitPrice,
    currentEffort,
    proposedEffort,
    suggestedPrice,
    netCurrent: calcNet(client.contractPrice, taxRate),
    netSuggested: calcNet(suggestedPrice, taxRate),
    taxRate,
  };
}

export async function getPricing(clientId: string, prId?: string): Promise<Pricing> {
  const p = await getSerializablePricing(clientId, prId);
  return {
    ...p,
    priceForNet: (x: number) => calcPriceForNet(x, p.taxRate),
  };
}
