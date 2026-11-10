# Craftsman's Writ planner (WoW Forever)

Static page that reads your Auctionator `Auctionator.lua` **in the browser** (nothing is uploaded)
and groups Craftsman's Writs by delivery location with AH prices and trends.

## Develop
```
npm run build                         # -> dist/index.html
npx serve dist                        # or just open dist/index.html
node test/decode.test.mjs path/to/Auctionator.lua
```

## Data
- `src/writs.json` — 150 writs scraped from Wowhead (quest id `q`, writ item `w`, tier `t` J/E/A,
  profession `p`, required item `i` × count `c`, locations `l`: [zone, npc, "x,y", allianceReaction, hordeReaction]).
- 98 writs have no location on Wowhead yet; users can add them in the "Location unknown" tab (saved in localStorage).

## Deploy (Cloudflare Pages, Git integration)
Build command `npm run build`, output directory `dist`. `public/_headers` is copied into `dist/`.
