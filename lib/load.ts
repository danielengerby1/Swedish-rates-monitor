import fs from "node:fs";
import path from "node:path";
import type { RatesData } from "./data";

/** Read the pipeline's snapshot at build time. Returns null before the first data run. */
export function loadData(): RatesData | null {
  const p = path.join(process.cwd(), "data", "rates.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as RatesData;
}
