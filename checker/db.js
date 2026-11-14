// Tiger Data (TimescaleDB) breach timeline. Public breach catalog only: no user emails or results are stored.
// Setup: cd checker && npm install, set DATABASE_URL, then load the catalog with: node checker/db.js
import { getCatalog } from "./sources.js";

let sql;
async function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!sql) sql = (await import("postgres")).default(process.env.DATABASE_URL);
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
  const rows = (await getCatalog())
    .filter((b) => b.breachedDate)
    .map((b) => ({
      breach_id: b.breachID,
      breached_at: b.breachedDate,
      domain: b.domain || null,
      industry: b.industry || null,
      records: b.exposedRecords ?? null,
      exposed_data: b.exposedData ?? [],
    }));
  await sql`INSERT INTO breaches ${sql(rows)}
    ON CONFLICT (breach_id, breached_at) DO UPDATE SET
      domain = EXCLUDED.domain, industry = EXCLUDED.industry, records = EXCLUDED.records, exposed_data = EXCLUDED.exposed_data`;
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

if (import.meta.main) {
  console.log(`loaded ${await loadCatalog()} breaches into Tiger Data`);
  await sql.end();
}
