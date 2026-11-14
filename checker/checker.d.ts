// Types for checker.js (and the server's JSON). Editors pick this up automatically for `import ... from "./checker/checker.js"`.
// Real examples of every shape: checker/samples/*.json

/** A breach that contained THIS email. */
export interface Breach {
  name: string;
  date: string | null; // YYYY-MM-DD
  exposedData: string[]; // categories only, e.g. "Passwords"; never leaked values
  domain?: string | null; // links the breach to an Account
}

/** A known breach of a SERVICE, whether or not this email was in it. */
export interface ServiceBreach {
  name: string;
  date: string; // YYYY-MM-DD
  exposedData: string[];
  records: number | null;
  industry?: string | null;
}

/** One website linked to the email = one skyscraper. */
export interface Account {
  name: string; // "Adobe"
  domain: string; // "adobe.com"
  breached: boolean; // red: this email was in a breach of this service
  breaches: string[]; // names of those breaches
  serviceBreaches: ServiceBreach[]; // amber when !breached && length > 0; newest first
  foundIn: Array<"inbox" | "breach">;
  firstSeen: string | null; // first sign-up email, YYYY-MM-DD
  lastSeen: string | null; // latest sign-up-style email
  signInWithGoogle: boolean;
}

/** The result of one check (planning.md's contract plus `accounts`). */
export interface AccountCheck {
  id: string; // hash of the email
  label: string; // masked email: the only form to display
  checkedAt: string | null; // ISO timestamp
  status: "clear" | "breached" | "unknown"; // never draw "unknown" as clear
  breaches: Breach[];
  accounts: Account[]; // sorted: red, amber, calm
  source: string; // show it: "XposedOrNot" or "Demo fixtures (sample data, not a live lookup)"
  error?: string; // safe, user-readable
}

export type BuildingState = "breached" | "service" | "clear"; // red | amber | calm

/** A skyscraper, ready to draw. */
export interface Building {
  key: string; // the domain: stable id
  label: string; // building sign, max 14 chars
  name: string; // full name for the detail panel
  domain: string;
  state: BuildingState;
  height: 1 | 2 | 3 | 4 | 5; // by account age
  logo: string | null; // path on the checker server ("/api/logo?breach=…"); null = draw initials
  signInWithGoogle: boolean;
}

export interface CityLayout {
  buildings: Building[]; // sorted: red, amber, calm; taller first
  district: { count: number; service: number } | null; // one "+count more" building when over `max`
}

export interface Summary {
  accounts: number;
  yourDataBreached: number;
  serviceBreached: number;
  noKnownBreach: number;
  exposureScore: number; // 0-100, our own heuristic: explain it in the UI
  exposedData: Array<{ type: string; breaches: number }>;
  oldestLeak: { name: string; date: string } | null;
  newestLeak: { name: string; date: string } | null;
  largestBreach: { name: string; account: string; records: number; date: string } | null;
  breachedWhileMember: Array<{ name: string; domain: string; breach: string; date: string; exposedData: string[] }>;
  fixFirst: Array<{ name: string; domain: string; why: string; steps: string[] }>; // most urgent first
  footprintByYear: Array<{ year: number; accounts: number }>;
  signInWithGoogle: number;
  dormant: number; // hint only: no sign-up-style email in 2+ years
  industries: Array<{ industry: string; accounts: number }>;
}

/** GET /api/news */
export interface NewsItem {
  name: string;
  domain: string | null;
  date: string | null; // when the breach happened
  addedDate: string | null; // when it became public
  industry: string | null;
  records: number | null;
  exposedData: string[];
  description: string | null; // plain text, ready as a headline blurb
}
export interface News {
  recent: NewsItem[];
  biggest: NewsItem[];
  thisYear: { year: number; breaches: number; records: number };
  source: "Tiger Data" | "XposedOrNot catalog";
}

/** GET /api/timeline (yours absent) and POST /api/timeline/mine (yours present) */
export interface TimelineYear {
  year: number;
  breaches: number;
  records: number;
  yours?: string[];
}

/** POST /api/explain (or the offline fallback built from nextSteps) */
export interface Explanation {
  summary: string | null;
  steps: string[];
  source?: "Gemini";
}

export const SOURCE: string;
export const DEMO_ACCOUNTS: string[]; // "city@demo.test" first: the judged demo

/** Demo addresses resolve offline; pass { endpoint } for a live check (email must be verified first). Throws on invalid input. */
export function checkAccount(input: string, options?: { endpoint?: string }): Promise<AccountCheck>;
/** Live check for whoever is signed in (after Google sign-in). */
export function checkSignedIn(endpoint: string): Promise<AccountCheck>;
export function cityLayout(check: AccountCheck, options?: { max?: number; now?: number }): CityLayout;
export function summarize(check: AccountCheck, now?: number): Summary;
/** Offline advice for one breach; mine = this email was in it. */
export function nextSteps(service: string, exposedData?: string[], mine?: boolean): string[];
export function shortName(name: string, max?: number): string;
/** Trimmed, lowercased email, or null if invalid. Use for form validation. */
export function normalizeEmail(input: unknown): string | null;
export function maskEmail(email: string): string;
export function baseDomain(host: string): string;
export function serviceKey(domain: string): string;
export function lookupDomains(domains: string[]): string[];
export function toAccounts(breaches: Breach[], inbox?: Array<Partial<Account> & { name: string; domain: string }>, serviceMap?: Map<string, ServiceBreach[]>): Account[];
export function accountId(email: string): Promise<string>;
