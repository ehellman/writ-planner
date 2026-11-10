// Usage: node test/decode.test.mjs path/to/Auctionator.lua
// Decodes the price DB and checks every writ/item lookup works. Not run in CI (needs your file).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const AucDB = createRequire(import.meta.url)("../src/core.cjs");
const file = process.argv[2];
if (!file) { console.log("pass the path to an Auctionator.lua to test decoding"); process.exit(0); }
const db = AucDB.parse(readFileSync(file));
const writs = JSON.parse(readFileSync(new URL("../src/writs.json", import.meta.url)));
for (const [realm, r] of Object.entries(db.realms)) {
  const w = writs.filter(x => r[x.w]).length, i = writs.filter(x => r[x.i]).length;
  console.log(`${realm}: ${Object.keys(r).length} items, ${w}/${writs.length} writs, ${i}/${writs.length} required items`);
}
