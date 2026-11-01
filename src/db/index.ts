import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('stratedge.db');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS indicators (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL,
    category TEXT NOT NULL,
    platforms TEXT NOT NULL,
    price_monthly REAL NOT NULL,
    price_annual REAL NOT NULL,
    price_lifetime REAL NOT NULL,
    win_rate_pct REAL NOT NULL,
    profit_factor REAL NOT NULL,
    sharpe_ratio REAL NOT NULL,
    max_drawdown_pct REAL NOT NULL,
    signals_per_day TEXT NOT NULL,
    timeframes TEXT NOT NULL,
    markets TEXT NOT NULL,
    version TEXT NOT NULL,
    tos_share_link TEXT NOT NULL,
    tos_study_filename TEXT NOT NULL,
    tv_script_id TEXT NOT NULL,
    description TEXT NOT NULL,
    thinkscript_code TEXT NOT NULL,
    pinescript_preview TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    tradingview_username TEXT NOT NULL DEFAULT '',
    thinkorswim_account_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    license_key TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    indicator_id TEXT NOT NULL,
    indicator_name TEXT NOT NULL,
    billing_cycle TEXT NOT NULL,
    amount_paid REAL NOT NULL,
    tradingview_username TEXT NOT NULL,
    tv_access_status TEXT NOT NULL,
    tos_download_count INTEGER NOT NULL DEFAULT 0,
    tos_share_link TEXT NOT NULL,
    tos_study_filename TEXT NOT NULL,
    provisioned_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS webhook_logs (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    license_key TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    tradingview_username TEXT NOT NULL,
    platform_target TEXT NOT NULL,
    status TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    payload_summary TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

export const db = drizzle(sqlite, { schema });

export function seedDatabaseIfEmpty() {
  // Ensure the full 6-card StratEdge Algo Gamma, Flow, Structure catalog is present
  const countRow = sqlite
    .prepare('SELECT COUNT(*) as cnt FROM indicators WHERE id LIKE ?')
    .get('se-algo-%') as { cnt: number } | undefined;
  if (countRow && countRow.cnt >= 5) {
    return;
  }

  sqlite.exec(`
    DELETE FROM indicators;
    DELETE FROM licenses;
    DELETE FROM webhook_logs;
    DELETE FROM users;
  `);

  const initialIndicators = [
    {
      id: 'se-algo-gamma',
      slug: 'stratedge-algo-gamma',
      name: 'StratEdge Algo Gamma',
      tagline:
        'Precision dealer gamma exposure (GEX) topology, zero-gamma flip thresholds, and vanna/charm acceleration corridors for scalping & 0DTE index options.',
      category: 'Gamma · Scalping',
      platforms: JSON.stringify(['TradingView', 'thinkorswim']),
      priceMonthly: 199,
      priceAnnual: 1490,
      priceLifetime: 2890,
      winRatePct: 76.4,
      profitFactor: 3.45,
      sharpeRatio: 3.08,
      maxDrawdownPct: 3.5,
      signalsPerDay: '5–9 setups / session',
      timeframes: '1m, 2m, 5m, 15m',
      markets: 'SPX, NDX, SPY, QQQ, ES, NQ 0DTE & Weekly Options',
      version: 'v5.2.0',
      tosShareLink: 'http://tos.mx/!StratEdgeAlgoGammaV52',
      tosStudyFilename: 'StratEdge_Algo_Gamma_v520.ts',
      tvScriptId: 'PUB;stratedge_algo_gamma_v6',
      description:
        'Precision Engineered. Evidence Driven. StratEdge Algo Gamma models live market-maker hedging obligations across strikes and expirations—pinpointing exact Call Wall resistance, Put Wall support, and the Zero-Gamma Flip axis where dealer pinning transitions into directional volatility expansion.',
      thinkScriptCode: `declare upper;
# STRATEDGE ALGO GAMMA — DEALER GEX & ZERO-GAMMA FLIP ENGINE
input ivPercentilePeriod = 30;
input gammaFlipSensitivity = 1.42;
input showCallPutWalls = yes;

def impVol = imp_volatility();
def tr = TrueRange(high, close, low);
def atrFast = ExpAverage(tr, 8);
def atrSlow = ExpAverage(tr, 34);
def negativeGammaRegime = atrFast > (atrSlow * gammaFlipSensitivity);

plot ZeroGammaFlipAxis = ExpAverage(hlc3, 21);
ZeroGammaFlipAxis.SetLineWeight(2);
ZeroGammaFlipAxis.AssignValueColor(if negativeGammaRegime then CreateColor(16, 185, 129) else CreateColor(56, 189, 248));

plot CallWallResistance = if showCallPutWalls then Highest(high, 34) + atrSlow * 0.5 else Double.NaN;
plot PutWallSupport = if showCallPutWalls then Lowest(low, 34) - atrSlow * 0.5 else Double.NaN;`,
      pineScriptPreview: `//@version=6
indicator("StratEdge Algo Gamma [Institutional GEX v5.2]", overlay=true, max_lines_count=500)
fastAtr = ta.ema(ta.tr(true), 8)
slowAtr = ta.ema(ta.tr(true), 34)
negGamma = fastAtr > slowAtr * 1.42
zeroGammaAxis = ta.ema(hlc3, 21)
plot(zeroGammaAxis, "Zero-Gamma Flip Axis", color=negGamma ? #10b981 : #38bdf8, linewidth=2)`,
    },
    {
      id: 'se-algo-flow',
      slug: 'stratedge-algo-flow',
      name: 'StratEdge Algo Flow',
      tagline:
        'Institutional order-flow absorption matrices, cumulative volume delta (CVD) divergence, and dark-pool block tape synthesis for day trading.',
      category: 'Flow · Day Trading',
      platforms: JSON.stringify(['TradingView', 'thinkorswim']),
      priceMonthly: 189,
      priceAnnual: 1490,
      priceLifetime: 2790,
      winRatePct: 74.9,
      profitFactor: 3.28,
      sharpeRatio: 2.91,
      maxDrawdownPct: 4.0,
      signalsPerDay: '4–8 setups / session',
      timeframes: '1m, 3m, 5m, 15m, 30m (Tick & Volume Bars)',
      markets: 'ES, NQ, CL, GC, S&P 500 Constituents, Major FX',
      version: 'v4.9.1',
      tosShareLink: 'http://tos.mx/!StratEdgeAlgoFlowV49',
      tosStudyFilename: 'StratEdge_Algo_Flow_v491.ts',
      tvScriptId: 'PUB;stratedge_algo_flow_v6',
      description:
        'Tracks aggressive market-order sweeps colliding with passive limit-order icebergs. StratEdge Algo Flow isolates institutional accumulation and distribution footprints before price breaks out of consolidation.',
      thinkScriptCode: `declare upper;
# STRATEDGE ALGO FLOW — ORDER-FLOW ABSORPTION & CVD ENGINE
input lookbackLength = 20;
input absorptionSigma = 1.85;

def volAvg = Average(volume, lookbackLength);
def highInstitutionalVol = volume > (volAvg * absorptionSigma);
def spread = Max(high - low, TickSize());
def deltaProxy = ((close - low) - (high - close)) / spread * volume;
def cumulativeDelta = TotalSum(deltaProxy);

def bullishAbsorption = low < Lowest(low[1], lookbackLength) and close > open and highInstitutionalVol;
def bearishAbsorption = high > Highest(high[1], lookbackLength) and close < open and highInstitutionalVol;

plot FlowLongTrigger = if bullishAbsorption then low - TickSize() * 2 else Double.NaN;
FlowLongTrigger.SetPaintingStrategy(PaintingStrategy.ARROW_UP);
FlowLongTrigger.SetDefaultColor(CreateColor(16, 185, 129));`,
      pineScriptPreview: `//@version=6
indicator("StratEdge Algo Flow [CVD & Absorption v4.9]", overlay=true)
len = input.int(20, "Order-Book Lookback")
sigma = input.float(1.85, "Institutional Volume Sigma")
isInstVol = volume > ta.sma(volume, len) * sigma
bullFlow = low < ta.lowest(low[1], len) and close > open and isInstVol
plotshape(bullFlow, "Flow Absorption Long", shape.triangleup, location.belowbar, #10b981, size=size.small)`,
    },
    {
      id: 'se-algo-structure',
      slug: 'stratedge-algo-structure',
      name: 'StratEdge Algo Structure',
      tagline:
        'Algorithmic market structure mapping, liquidity sweep validation, multi-sigma anchored VWAP bands, and volatility regime architecture for day & swing trading.',
      category: 'Structure · Swing & Day',
      platforms: JSON.stringify(['TradingView', 'thinkorswim']),
      priceMonthly: 179,
      priceAnnual: 1390,
      priceLifetime: 2590,
      winRatePct: 72.8,
      profitFactor: 3.62,
      sharpeRatio: 2.86,
      maxDrawdownPct: 4.3,
      signalsPerDay: '3–6 setups / session',
      timeframes: '5m, 15m, 1H, 4H, Daily, Weekly',
      markets: 'US Equities, Index Futures, Sector ETFs, Digital Assets',
      version: 'v4.6.0',
      tosShareLink: 'http://tos.mx/!StratEdgeAlgoStructureV46',
      tosStudyFilename: 'StratEdge_Algo_Structure_v460.ts',
      tvScriptId: 'PUB;stratedge_algo_structure_v6',
      description:
        'Maps institutional Break of Structure (BOS), Change of Character (CHoCH), and Fair Value Gaps (FVG) aligned with multi-session Anchored VWAP standard deviation bands and Chandelier regime stops.',
      thinkScriptCode: `declare upper;
# STRATEDGE ALGO STRUCTURE — MARKET STRUCTURE & VWAP SIGMA ARCHITECT
input structureLookback = 22;
input sigmaMultiplier = 2.0;

def vwapValue = reference VWAP();
def atrVal = MovingAverage(AverageType.WILDERS, TrueRange(high, close, low), structureLookback);

plot InstitutionalVWAP = vwapValue;
plot StructureUpperSigma = vwapValue + sigmaMultiplier * atrVal;
plot StructureLowerSigma = vwapValue - sigmaMultiplier * atrVal;

InstitutionalVWAP.SetDefaultColor(CreateColor(56, 189, 248));
StructureUpperSigma.SetDefaultColor(CreateColor(239, 68, 68));
StructureLowerSigma.SetDefaultColor(CreateColor(16, 185, 129));`,
      pineScriptPreview: `//@version=6
indicator("StratEdge Algo Structure [BOS + VWAP Sigma v4.6]", overlay=true)
[vwapVal, upper2S, lower2S] = ta.vwap(hlc3, timeframe.change("1D"), 2.0)
plot(vwapVal, "Structure Anchor VWAP", color=#38bdf8, linewidth=2)
plot(upper2S, "+2.0 Sigma Premium Zone", color=#ef4444)
plot(lower2S, "-2.0 Sigma Discount Zone", color=#10b981)`,
    },
    {
      id: 'se-algo-gamma-0dte-scanner',
      slug: 'stratedge-algo-gamma-0dte-scanner',
      name: 'StratEdge Algo Gamma — 0DTE Strike Scanner',
      tagline:
        'Real-time thinkorswim MarketWatch column & TradingView multi-ticker screener alerting on imminent Zero-Gamma flips and Call/Put wall pin breaks.',
      category: 'Gamma · Scalping',
      platforms: JSON.stringify(['TradingView', 'thinkorswim']),
      priceMonthly: 159,
      priceAnnual: 1190,
      priceLifetime: 2290,
      winRatePct: 75.1,
      profitFactor: 3.19,
      sharpeRatio: 2.94,
      maxDrawdownPct: 3.8,
      signalsPerDay: '8–14 scanner alerts / session',
      timeframes: '1m, 3m, 5m',
      markets: 'SPX, SPY, QQQ, NDX, IWM, Mag-7 Weekly Options',
      version: 'v3.8.4',
      tosShareLink: 'http://tos.mx/!StratEdgeGammaScanV38',
      tosStudyFilename: 'StratEdge_Algo_GammaScanner_v384.ts',
      tvScriptId: 'PUB;stratedge_algo_gamma_scanner_v6',
      description:
        'Scans 25+ liquid options underlyings simultaneously to flag dealer gamma squeezes within 90 seconds of market-maker hedging inflection.',
      thinkScriptCode: `declare lower;
# STRATEDGE ALGO GAMMA 0DTE SCANNER COLUMN
def tr = TrueRange(high, close, low);
def squeezeRatio = ExpAverage(tr, 5) / Max(ExpAverage(tr, 21), TickSize());
plot GammaSqueezeScore = Round(squeezeRatio * 50, 1);`,
      pineScriptPreview: `//@version=6
indicator("StratEdge Algo Gamma 0DTE Multi-Ticker Scanner [v3.8]", overlay=false)
score = ta.ema(ta.tr(true), 5) / math.max(ta.ema(ta.tr(true), 21), syminfo.mintick) * 50
plot(score, "Gamma Squeeze Velocity", color=#10b981)`,
    },
    {
      id: 'se-algo-flow-darkpool',
      slug: 'stratedge-algo-flow-darkpool-matrix',
      name: 'StratEdge Algo Flow — DarkPool Block Oscillator',
      tagline:
        'Upstairs off-exchange block print detector and institutional smart-money accumulation oscillator for high-beta equities and index futures.',
      category: 'Flow · Day Trading',
      platforms: JSON.stringify(['TradingView', 'thinkorswim']),
      priceMonthly: 169,
      priceAnnual: 1290,
      priceLifetime: 2490,
      winRatePct: 73.6,
      profitFactor: 3.12,
      sharpeRatio: 2.79,
      maxDrawdownPct: 4.2,
      signalsPerDay: '4–7 setups / session',
      timeframes: '5m, 15m, 1H, 4H',
      markets: 'NVDA, AAPL, TSLA, META, MSFT, SPY, QQQ, ES, NQ',
      version: 'v4.1.2',
      tosShareLink: 'http://tos.mx/!StratEdgeFlowDarkPoolV41',
      tosStudyFilename: 'StratEdge_Algo_FlowDarkPool_v412.ts',
      tvScriptId: 'PUB;stratedge_algo_flow_darkpool_v6',
      description:
        'Isolates off-exchange institutional block accumulation by comparing narrow-spread high-volume absorption bars against retail exhaustion spikes.',
      thinkScriptCode: `declare lower;
# STRATEDGE ALGO FLOW — DARKPOOL BLOCK OSCILLATOR
input length = 14;
def clv = ((close - low) - (high - close)) / Max(high - low, TickSize());
plot DarkPoolFlow = ExpAverage(clv * volume, length) / ExpAverage(volume, length) * 100;`,
      pineScriptPreview: `//@version=6
indicator("StratEdge Algo Flow DarkPool Block Oscillator [v4.1]", overlay=false)
clv = ((close - low) - (high - close)) / math.max(high - low, syminfo.mintick)
plot(ta.ema(clv * volume, 14) / ta.ema(volume, 14) * 100, "Block Flow", color=#38bdf8)`,
    },
    {
      id: 'se-institutional-bundle',
      slug: 'stratedge-algo-complete-trinity',
      name: 'StratEdge Algo Trinity Bundle (Gamma + Flow + Structure)',
      tagline:
        'Complete institutional access to StratEdge Algo Gamma, Flow, and Structure across both TradingView and thinkorswim under one unified desk license.',
      category: 'Full Suite',
      platforms: JSON.stringify(['TradingView', 'thinkorswim']),
      priceMonthly: 299,
      priceAnnual: 1990,
      priceLifetime: 3890,
      winRatePct: 77.2,
      profitFactor: 3.74,
      sharpeRatio: 3.24,
      maxDrawdownPct: 3.1,
      signalsPerDay: 'All Gamma, Flow & Structure Models Included',
      timeframes: 'All Tick, Intraday, Swing & Multi-Week Timeframes',
      markets: 'All Futures, Options, Equities, FX & Commodities',
      version: 'v6.0.0 Trinity Edition',
      tosShareLink: 'http://tos.mx/!StratEdgeTrinitySuiteV60',
      tosStudyFilename: 'StratEdge_Algo_TrinitySuite_v600.ts',
      tvScriptId: 'PUB;stratedge_algo_trinity_suite_v6',
      description:
        'Unlocks the complete StratEdge Algo ecosystem—Gamma, Flow, and Structure—synchronizing dealer gamma exposure, real-time order-book delta absorption, and multi-timeframe market structure on TradingView and Charles Schwab thinkorswim.',
      thinkScriptCode: `declare upper;
# STRATEDGE ALGO TRINITY MASTER SUITE (GAMMA + FLOW + STRUCTURE) v6.0.0
input enableGammaEngine = yes;
input enableFlowAbsorption = yes;
input enableStructureBands = yes;

def vwapValue = reference VWAP();
def atrVal = MovingAverage(AverageType.WILDERS, TrueRange(high, close, low), 21);
plot TrinityFairValue = if enableStructureBands then vwapValue else Double.NaN;
plot GammaCallWall = if enableGammaEngine then vwapValue + 2.0 * atrVal else Double.NaN;
plot GammaPutWall = if enableGammaEngine then vwapValue - 2.0 * atrVal else Double.NaN;`,
      pineScriptPreview: `//@version=6
indicator("StratEdge Algo Trinity Master Suite [Gamma + Flow + Structure v6.0]", overlay=true)
showGamma = input.bool(true, "Enable StratEdge Algo Gamma")
showFlow  = input.bool(true, "Enable StratEdge Algo Flow")
showStruct = input.bool(true, "Enable StratEdge Algo Structure")
plot(ta.vwap(hlc3), "Trinity Institutional Equilibrium", color=#10b981, linewidth=2)`,
    },
  ];

  for (const item of initialIndicators) {
    db.insert(schema.indicatorsTable).values(item).run();
  }

  const seedUsers = [
    {
      id: 'usr-demo-trader',
      email: 'marcus.vance@apexquant.io',
      name: 'Marcus Vance',
      role: 'customer',
      tradingViewUsername: 'MarcusVance_ES',
      thinkorswimAccountId: 'TOS-994182',
      createdAt: '2026-09-14T08:30:00Z',
    },
    {
      id: 'usr-admin-desk',
      email: 'admin@stratedgealgo.com',
      name: 'willribeiro (Managing Partner)',
      role: 'admin',
      tradingViewUsername: 'StratEdge_Official',
      thinkorswimAccountId: 'TOS-MASTER-01',
      createdAt: '2026-01-10T09:00:00Z',
    },
  ];

  for (const u of seedUsers) {
    db.insert(schema.usersTable).values(u).run();
  }

  const seedLicenses = [
    {
      id: 'lic-1001',
      licenseKey: 'SE-GAMM-4F9A-8821',
      userId: 'usr-demo-trader',
      customerEmail: 'marcus.vance@apexquant.io',
      customerName: 'Marcus Vance',
      indicatorId: 'se-algo-gamma',
      indicatorName: 'StratEdge Algo Gamma',
      billingCycle: 'Annual',
      amountPaid: 1490,
      tradingViewUsername: 'MarcusVance_ES',
      tvAccessStatus: 'Provisioned',
      tosDownloadCount: 4,
      tosShareLink: 'http://tos.mx/!StratEdgeAlgoGammaV52',
      tosStudyFilename: 'StratEdge_Algo_Gamma_v520.ts',
      provisionedAt: '2026-10-12 09:14:22 UTC',
      expiresAt: '2027-10-12',
    },
    {
      id: 'lic-1002',
      licenseKey: 'SE-FLOW-4F9A-3109',
      userId: 'usr-demo-trader',
      customerEmail: 'marcus.vance@apexquant.io',
      customerName: 'Marcus Vance',
      indicatorId: 'se-algo-flow',
      indicatorName: 'StratEdge Algo Flow',
      billingCycle: 'Lifetime',
      amountPaid: 2790,
      tradingViewUsername: 'MarcusVance_ES',
      tvAccessStatus: 'Provisioned',
      tosDownloadCount: 3,
      tosShareLink: 'http://tos.mx/!StratEdgeAlgoFlowV49',
      tosStudyFilename: 'StratEdge_Algo_Flow_v491.ts',
      provisionedAt: '2026-10-18 14:20:05 UTC',
      expiresAt: '2125-10-18',
    },
    {
      id: 'lic-1003',
      licenseKey: 'SE-TRIN-9C2E-7741',
      userId: 'usr-inst-2',
      customerEmail: 'elena.rostova@zurichprop.ch',
      customerName: 'Elena Rostova',
      indicatorId: 'se-institutional-bundle',
      indicatorName: 'StratEdge Algo Trinity Bundle (Gamma + Flow + Structure)',
      billingCycle: 'Lifetime',
      amountPaid: 3306.5,
      tradingViewUsername: 'Elena_ZurichQuant',
      tvAccessStatus: 'Provisioned',
      tosDownloadCount: 8,
      tosShareLink: 'http://tos.mx/!StratEdgeTrinitySuiteV60',
      tosStudyFilename: 'StratEdge_Algo_TrinitySuite_v600.ts',
      provisionedAt: '2026-10-24 11:05:49 UTC',
      expiresAt: '2125-10-24',
    },
    {
      id: 'lic-1004',
      licenseKey: 'SE-STRU-7B1D-5590',
      userId: 'usr-inst-3',
      customerEmail: 'david.chen@pacificcap.com',
      customerName: 'David Chen',
      indicatorId: 'se-algo-structure',
      indicatorName: 'StratEdge Algo Structure',
      billingCycle: 'Annual',
      amountPaid: 1390,
      tradingViewUsername: 'DChen_SwingMacro',
      tvAccessStatus: 'Provisioned',
      tosDownloadCount: 2,
      tosShareLink: 'http://tos.mx/!StratEdgeAlgoStructureV46',
      tosStudyFilename: 'StratEdge_Algo_Structure_v460.ts',
      provisionedAt: '2026-10-28 16:42:11 UTC',
      expiresAt: '2027-10-28',
    },
  ];

  for (const lic of seedLicenses) {
    db.insert(schema.licensesTable).values(lic).run();
  }

  const seedWebhooks = [
    {
      id: 'wh-901',
      eventType: 'checkout.fulfillment.completed',
      licenseKey: 'SE-GAMM-4F9A-8821',
      customerEmail: 'marcus.vance@apexquant.io',
      tradingViewUsername: 'MarcusVance_ES',
      platformTarget: 'TradingView Invite-Only ACL + thinkorswim Study Vault',
      status: '200 OK — Provisioned',
      latencyMs: 92,
      payloadSummary:
        'Granted @MarcusVance_ES access to PUB;stratedge_algo_gamma_v6 & generated StratEdge_Algo_Gamma_v520.ts',
      createdAt: '2026-10-12 09:14:22 UTC',
    },
    {
      id: 'wh-902',
      eventType: 'checkout.fulfillment.completed',
      licenseKey: 'SE-TRIN-9C2E-7741',
      customerEmail: 'elena.rostova@zurichprop.ch',
      tradingViewUsername: 'Elena_ZurichQuant',
      platformTarget: 'TradingView Trinity Bundle + thinkorswim Master Suite',
      status: '200 OK — Provisioned',
      latencyMs: 84,
      payloadSummary:
        'Granted @Elena_ZurichQuant access to StratEdge Algo Gamma, Flow & Structure + TOS workspace bundle',
      createdAt: '2026-10-24 11:05:49 UTC',
    },
    {
      id: 'wh-903',
      eventType: 'tradingview.acl.resync',
      licenseKey: 'SE-STRU-7B1D-5590',
      customerEmail: 'david.chen@pacificcap.com',
      tradingViewUsername: 'DChen_SwingMacro',
      platformTarget: 'TradingView Pine Script v6 Permission Server',
      status: '200 OK — Synced',
      latencyMs: 76,
      payloadSummary:
        'Verified invite-only script whitelist for @DChen_SwingMacro on StratEdge Algo Structure',
      createdAt: '2026-10-28 16:42:11 UTC',
    },
  ];

  for (const wh of seedWebhooks) {
    db.insert(schema.webhookLogsTable).values(wh).run();
  }
}
