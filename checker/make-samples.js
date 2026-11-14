// Regenerates checker/samples/*.json: real output of every frontend-facing call, to build UI against without a server.
// Run: npm run samples   (offline parts always; news/timeline need DATABASE_URL in .env or network)
import { mkdirSync, writeFileSync } from "node:fs";
import { checkAccount, cityLayout, nextSteps, summarize } from "./checker.js";
import { news, personalTimeline } from "./db.js";

const dir = new URL("./samples/", import.meta.url);
mkdirSync(dir, { recursive: true });
const save = (name, data) => {
  writeFileSync(new URL(name, dir), JSON.stringify(data, null, 2) + "\n");
  console.log(`samples/${name}`);
};
const NOW = Date.parse("2026-11-14"); // fixed, so ages and heights don't drift between runs

const city = await checkAccount("city@demo.test");
city.checkedAt = "2026-11-14T12:00:00.000Z";
save("check-city.json", city);
save("check-unknown.json", await checkAccount("unknown@demo.test"));
save("city-layout.json", cityLayout(city, { now: NOW }));
save("city-layout-crowded.json", cityLayout(city, { max: 12, now: NOW }));
save("summary.json", summarize(city, NOW));

const adobe = city.accounts.find((a) => a.domain === "adobe.com");
save("explain-fallback.json", { summary: null, steps: nextSteps(adobe.name, adobe.serviceBreaches[0].exposedData, adobe.breached) });

try {
  save("news.json", await news(5));
} catch {
  console.log("skipped news.json (no Tiger Data and no network)");
}
const tl = await personalTimeline(city.accounts.map((a) => a.domain)).catch(() => null);
tl ? save("timeline-mine.json", tl) : console.log("skipped timeline-mine.json (needs DATABASE_URL)");
setTimeout(() => process.exit(0), 50); // close the database pool
