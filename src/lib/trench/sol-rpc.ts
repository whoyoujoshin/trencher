/** Prefer a private Solana RPC (DO env) — public endpoints often 403 cloud IPs. */
export function solRpcUrls(): string[] {
  const urls: string[] = [];
  const direct = String(process.env.SOLANA_RPC_URL ?? "").trim();
  if (direct) urls.push(direct);
  const helius = String(process.env.HELIUS_API_KEY ?? "").trim();
  if (helius) urls.push(`https://mainnet.helius-rpc.com/?api-key=${helius}`);
  for (const u of [
    "https://api.mainnet-beta.solana.com",
    "https://solana-rpc.publicnode.com",
    "https://rpc.ankr.com/solana",
  ]) {
    if (!urls.includes(u)) urls.push(u);
  }
  return urls;
}
