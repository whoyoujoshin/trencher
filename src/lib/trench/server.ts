import { createServerFn } from "@tanstack/react-start";
import { HUNT_MCAP_MIN, isEvmMint, type PumpCoin } from "./types";
import { solRpcUrls } from "./sol-rpc";

const PUMP = "https://frontend-api-v3.pump.fun";
const RH_RPCS = [
  "https://robinhood-rpc.publicnode.com",
  "https://rpc-robinhood.blockmachine.io",
  "https://rpc.solidrpc.io/public/evm/4663",
  "https://robinhood.rpc.blxrbdn.com",
  "https://rpc.mainnet.chain.robinhood.com",
];
const RH_V3_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
const PONS_V2_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
const RH_WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const PONS_USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const POOL_CREATED =
  "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118";
const TOKEN_LAUNCHED =
  "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";
const PONS_FEE = 10_000;
const PONS_SUPPLY = 1_000_000_000;
const NAME_SEL = "0x06fdde03";
const SYMBOL_SEL = "0x95d89b41";
const SLOT0_SEL = "0x3850c7bd";
const BALANCE_OF_SEL = "0x70a08231";
const PONS_LOOKBACK = 9_000;
const PONS_V2_WINDOWS = 2;
const PONS_BLOCK_MS = 100;
const PONS_FRESH_MS = 800;
const PONS_STALE_MS = 10 * 60_000;

const creatorCache = new Map<
  string,
  { at: number; count: number; symbols: string[] }
>();
const CREATOR_TTL = 3 * 60_000;

type RawCoin = Record<string, unknown>;
