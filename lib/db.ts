import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DATABASE_URL;
const url = rawUrl?.startsWith("file:./")
  ? `file:${resolve(process.cwd(), "prisma", rawUrl.slice("file:./".length)).replace(/\\/g, "/")}`
  : rawUrl;

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
if (process.env.NODE_ENV !== "production") g.prisma = db;
