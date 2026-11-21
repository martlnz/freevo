// Calls getMe and prints only ok / display_name (never the token).
try { process.loadEnvFile(".env"); } catch {}

async function main() {
  const token = process.env.ZALO_BOT_TOKEN;
  if (!token) { console.error("ZALO_BOT_TOKEN missing"); process.exit(1); }
  const res = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/getMe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const j = (await res.json()) as { ok?: boolean; result?: { display_name?: string }; description?: string };
  console.log({ ok: j.ok, display_name: j.result?.display_name, description: j.ok ? undefined : j.description });
}
main().catch((e) => { console.error("probe failed:", (e as Error).message); process.exit(1); });
