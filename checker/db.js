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
    }));
  await sql`INSERT INTO breaches ${sql(rows)}
    ON CONFLICT (breach_id, breached_at) DO UPDATE SET
      domain = EXCLUDED.domain, base_domain = EXCLUDED.base_domain, industry = EXCLUDED.industry,
      records = EXCLUDED.records, exposed_data = EXCLUDED.exposed_data`;
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
        SELECT base_domain, breach_id, breached_at::date::text AS date, exposed_data, records
        FROM breaches WHERE base_domain = ANY(${domains}) ORDER BY breached_at DESC`;
      for (const r of rows) add(r.base_domain, { name: r.breach_id, date: r.date, exposedData: r.exposed_data ?? [], records: r.records === null ? null : Number(r.records) });
      return out;
    } catch {} // fall through to the in-memory catalog
  }
  const wanted = new Set(domains);
  for (const b of await getCatalog().catch(() => [])) {
    const d = b.domain && baseDomain(b.domain);
    if (d && wanted.has(d) && b.breachedDate) add(d, { name: b.breachID, date: b.breachedDate.slice(0, 10), exposedData: b.exposedData ?? [], records: b.exposedRecords ?? null });
  }
  for (const list of out.values()) list.sort((x, y) => y.date.localeCompare(x.date));
  return out;
}

if (import.meta.main) {
  console.log(`loaded ${await loadCatalog()} breaches into Tiger Data`);
  await sql.end();
}
