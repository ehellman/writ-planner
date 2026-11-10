// Builds dist/index.html from src/ (inlines the decoder + writ data) and copies public/.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";

const core = readFileSync("src/core.cjs", "utf8")
  .replace('if (typeof module !== "undefined") module.exports = AucDB;', "");
const writs = JSON.parse(readFileSync("src/writs.json", "utf8"));
if (!Array.isArray(writs) || writs.length < 100) throw new Error(`writs.json looks wrong (${writs.length} entries)`);

const html = readFileSync("src/app.html", "utf8")
  .replace("/*CORE*/", () => core)
  .replace("/*WRITS*/", () => JSON.stringify(writs));
if (html.includes("/*CORE*/") || html.includes("/*WRITS*/")) throw new Error("placeholder not replaced");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
cpSync("public", "dist", { recursive: true });
writeFileSync("dist/index.html", html);
console.log(`dist/index.html: ${(html.length / 1024).toFixed(1)} KB, ${writs.length} writs`);
