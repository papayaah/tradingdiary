// No-login UI seed: paste this in the browser console on http://localhost:3000/watch
// (signed out). It loads all seeded symbols into localStorage so the page shows them.
// The scanner still reads the DB (npm run db:seed); this is only for the on-screen list.
localStorage.setItem('watcher-watchlist', JSON.stringify(
[
  {
    "symbol": "BTC-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "ETH-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "SOL-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "AA",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "AAPL",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "ADP",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "AFRM",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "AMZN",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "APP",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "ARM",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "AXP",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "BABA",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "BAC",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "BIDU",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "BILI",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "BMY",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "BTU",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "CCL",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "CENX",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "CHTR",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "CLF",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "CLSK",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "CMG",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "COIN",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "CRWV",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "DECK",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "DELL",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "DIS",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "DOCU",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "DUOL",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "ENPH",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "FCX",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "FDX",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "FIG",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "FSLR",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "GLD",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "GOOGL",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "GS",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "HOOD",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "IBKR",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "IBM",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "INTC",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "JNJ",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "JPM",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "KORU",
    "interval": "10m",
    "minMovePercent": 0.15
  },
  {
    "symbol": "LMND",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "LRCX",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "MA",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "MARA",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "META",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "MMM",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "MNDY",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "MSFT",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "MSTR",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "MU",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "NCLH",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "NEM",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "NFLX",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "NOW",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "NVDA",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "NVTS",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "ORCL",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "OXY",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "PG",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "PM",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "PYPL",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "QCOM",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "QQQ",
    "interval": "10m",
    "minMovePercent": 0.2
  },
  {
    "symbol": "RBLX",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "RDDT",
    "interval": "10m",
    "minMovePercent": 1
  },
  {
    "symbol": "ROKU",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "SHOP",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "SKHY",
    "interval": "10m",
    "minMovePercent": 0.15
  },
  {
    "symbol": "SLV",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "SNDK",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "SOFI",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "SOXL",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "SPCX",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "STX",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "TDOC",
    "interval": "10m",
    "minMovePercent": 0.55
  },
  {
    "symbol": "TGT",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "TSLA",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "TTD",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "U",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "UAL",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "UPST",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "USO",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "VLO",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "VZ",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "WMT",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "XOM",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "XYZ",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "ZM",
    "interval": "10m",
    "minMovePercent": 0.25
  },
  {
    "symbol": "CL=F",
    "interval": "10m",
    "minMovePercent": 0.05
  },
  {
    "symbol": "ES=F",
    "interval": "10m",
    "minMovePercent": 0.05
  },
  {
    "symbol": "GC=F",
    "interval": "10m",
    "minMovePercent": 0.05
  },
  {
    "symbol": "NQ=F",
    "interval": "10m",
    "minMovePercent": 0.05
  },
  {
    "symbol": "SI=F",
    "interval": "10m",
    "minMovePercent": 0.05
  },
  {
    "symbol": "YM=F",
    "interval": "10m",
    "minMovePercent": 0.05
  },
  {
    "symbol": "XRP-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "DOGE-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "ADA-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "AVAX-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "LINK-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "DOT-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "LTC-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "BCH-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "UNI-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "ATOM-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "XLM-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "ETC-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "NEAR-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "SHIB-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "APT-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "ARB-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "OP-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "FIL-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "ICP-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "HBAR-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "SUI-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  },
  {
    "symbol": "INJ-USD",
    "interval": "10m",
    "minMovePercent": 0.5
  }
]
));
location.reload();
