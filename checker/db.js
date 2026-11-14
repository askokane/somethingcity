// Tiger Data (TimescaleDB): the public breach catalog as a hypertable. No user emails or results are stored.
// It powers two things: the breach timeline, and "was this service ever breached?" for every account a user has.
// Setup: cd checker && npm install, set DATABASE_URL, then load the catalog with: node checker/db.js
import { baseDomain } from "./checker.js";
import { getCatalog } from "./sources.js";

let sql;
async function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!sql) sql = (await import("postgres")).default(process.env.DATABASE_URL, { onnotice: () => {}, idle_timeout: 10 });
  return sql;
}

/** Create the hypertable (once) and upsert every breach in the XposedOrNot catalog. */
export async function loadCatalog() {
  const sql = await db();
  if (!sql) throw new Error("Set DATABASE_URL to your Tiger Data connection string.");
  await sql`CREATE TABLE IF NOT EXISTS breaches (
    breach_id text NOT NULL,
    breached_at timestamptz NOT NULL,
    domain text,
    industry text,
    records bigint,
    exposed_data text[],
    PRIMARY KEY (breach_id, breached_at)
  )`;
  await sql`SELECT create_hypertable('breaches', by_range('breached_at', INTERVAL '1 year'), if_not_exists => TRUE)`;
  await sql`ALTER TABLE breaches ADD COLUMN IF NOT EXISTS base_domain text`; // "mail.adobe.com" -> "adobe.com", for joins
  await sql`ALTER TABLE breaches ADD COLUMN IF NOT EXISTS added_at timestamptz`; // when the breach became public: the news date
  await sql`ALTER TABLE breaches ADD COLUMN IF NOT EXISTS description text`;
  await sql`CREATE INDEX IF NOT EXISTS breaches_base_domain ON breaches (base_domain)`;
  const rows = (await getCatalog())
    .filter((b) => b.breachedDate)
    .map((b) => ({
      breach_id: b.breachID,
      breached_at: b.breachedDate,
      domain: b.domain || null,
      base_domain: b.domain ? baseDomain(b.domain) : null,
      industry: b.industry || null,
      records: b.exposedRecords ?? null,
      exposed_data: b.exposedData ?? [],
      added_at: b.addedDate || null,
      description: plainText(b.exposureDescription),
    }));
  await sql`INSERT INTO breaches ${sql(rows)}
    ON CONFLICT (breach_id, breached_at) DO UPDATE SET
      domain = EXCLUDED.domain, base_domain = EXCLUDED.base_domain, industry = EXCLUDED.industry,
      records = EXCLUDED.records, exposed_data = EXCLUDED.exposed_data,
      added_at = EXCLUDED.added_at, description = EXCLUDED.description`;
  return rows.length;
}

/** Breaches and exposed records per year, or null when Tiger Data isn't configured. */
export async function timeline() {
  const sql = await db();
  if (!sql) return null;
  return sql`
    SELECT extract(year FROM time_bucket('1 year', breached_at))::int AS year,
           count(*)::int AS breaches,
           coalesce(sum(records), 0)::float8 AS records
    FROM breaches GROUP BY 1 ORDER BY 1`;
}

/** XposedOrNot descriptions contain HTML: keep the text, at most ~300 characters. */
export function plainText(html) {
  if (!html) return null;
  const text = String(html).replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return text.length > 300 ? text.slice(0, 297).replace(/\s+\S*$/, "") + "…" : text;
}

const newsItem = (b) => ({
  name: b.breachID, domain: b.domain || null, date: b.breachedDate?.slice(0, 10) ?? null, addedDate: b.addedDate?.slice(0, 10) ?? null,
  industry: b.industry || null, records: b.exposedRecords ?? null, exposedData: b.exposedData ?? [], description: plainText(b.exposureDescription),
});

/**
 * Breach news for the Cobblepot Manor panel: { recent, biggest, thisYear, source }.
 * recent = newest to become public (by added date); biggest = all-time largest by records; thisYear = totals for the current year.
 */
export async function news(limit = 10) {
  limit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const year = new Date().getUTCFullYear();
  const sql = await db().catch(() => null);
  if (sql) {
    try {
      const cols = sql`breach_id AS name, domain, breached_at::date::text AS date, added_at::date::text AS "addedDate", industry, records::float8 AS records, exposed_data AS "exposedData", description`;
      const [recent, biggest, [totals]] = await Promise.all([
        sql`SELECT ${cols} FROM breaches WHERE added_at IS NOT NULL ORDER BY added_at DESC LIMIT ${limit}`,
        // Named services only: skip anonymous combo lists like "Collection-1" that aren't one company's breach
        sql`SELECT ${cols} FROM breaches WHERE records IS NOT NULL AND domain IS NOT NULL ORDER BY records DESC LIMIT ${limit}`,
        sql`SELECT count(*)::int AS breaches, coalesce(sum(records), 0)::float8 AS records FROM breaches
            WHERE breached_at >= make_date(${year}, 1, 1)`, // hypertable: only this year's chunk is scanned
      ]);
      return { recent, biggest, thisYear: { year, ...totals }, source: "Tiger Data" };
    } catch {} // fall through to the in-memory catalog
  }
  const all = await getCatalog();
  const thisYear = all.filter((b) => b.breachedDate?.startsWith(String(year)));
  return {
    recent: all.filter((b) => b.addedDate).sort((x, y) => y.addedDate.localeCompare(x.addedDate)).slice(0, limit).map(newsItem),
    biggest: all.filter((b) => b.exposedRecords && b.domain).sort((x, y) => y.exposedRecords - x.exposedRecords).slice(0, limit).map(newsItem),
    thisYear: { year, breaches: thisYear.length, records: thisYear.reduce((n, b) => n + (b.exposedRecords ?? 0), 0) },
    source: "XposedOrNot catalog",
  };
}

/**
 * The world timeline with this user's services marked: [{ year, breaches, records, yours: [breach names] }].
 * domains: the user's account domains (from a check result). Null when Tiger Data isn't configured.
 */
export async function personalTimeline(domains) {
  const sql = await db();
  if (!sql) return null;
  return sql`
    SELECT extract(year FROM time_bucket('1 year', breached_at))::int AS year,
           count(*)::int AS breaches,
           coalesce(sum(records), 0)::float8 AS records,
           coalesce(array_agg(breach_id ORDER BY breached_at) FILTER (WHERE base_domain = ANY(${domains})), '{}') AS yours
    FROM breaches GROUP BY 1 ORDER BY 1`;
}

/**
 * Every known breach of these services, whether or not this user's email was in it.
 * domains: base domains like ["adobe.com", "chegg.com"]. Returns Map(domain -> [{ name, date, exposedData, records }]).
 * Uses Tiger Data when configured, otherwise the in-memory XposedOrNot catalog, so it works either way.
 */
export async function serviceBreaches(domains) {
  const out = new Map();
  if (!domains.length) return out;
  const add = (domain, b) => {
    if (!out.has(domain)) out.set(domain, []);
    out.get(domain).push(b);
  };
  const sql = await db().catch(() => null);
  if (sql) {
    try {
      const rows = await sql`
        SELECT base_domain, breach_id, breached_at::date::text AS date, exposed_data, records, industry
        FROM breaches WHERE base_domain = ANY(${domains}) ORDER BY breached_at DESC`;
      for (const r of rows) add(r.base_domain, { name: r.breach_id, date: r.date, exposedData: r.exposed_data ?? [], records: r.records === null ? null : Number(r.records), industry: r.industry });
      return out;
    } catch {} // fall through to the in-memory catalog
  }
  const wanted = new Set(domains);
  for (const b of await getCatalog().catch(() => [])) {
    const d = b.domain && baseDomain(b.domain);
    if (d && wanted.has(d) && b.breachedDate) add(d, { name: b.breachID, date: b.breachedDate.slice(0, 10), exposedData: b.exposedData ?? [], records: b.exposedRecords ?? null, industry: b.industry || null });
  }
  for (const list of out.values()) list.sort((x, y) => y.date.localeCompare(x.date));
  return out;
}

if (import.meta.main) {
  console.log(`loaded ${await loadCatalog()} breaches into Tiger Data`);
  await sql.end();
}
