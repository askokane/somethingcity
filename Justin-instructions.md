# Justin — Account Infrastructure Instructions

## Mission
Build the account entry and breach-check layer for the Breach City demo. It should accept user-authorized account identifiers, return a safe normalized result, and remain demoable when a live provider is unavailable.

## Interface contract
Coordinate with Atharva before implementation and expose a small stable interface. Use the planning document's `AccountCheck` type:

- `id`: stable app identifier, not the raw email.
- `label`: masked display label.
- `checkedAt`: ISO timestamp or `null`.
- `status`: `clear`, `breached`, or `unknown`.
- `breaches`: normalized name/date/exposed-data metadata only.
- `source`: provider or clearly identified demo fixture source.
- `error`: optional safe, user-readable explanation.

The checker returns `unknown` for errors, timeouts, rate limits, missing configuration, or incomplete results. Never interpret a failed request as clear.

## Scope
- Implement account input validation and masking helpers, or coordinate their ownership with Atharva to avoid duplicate UI work.
- Build a provider adapter for an approved email breach-check source if credentials and time allow.
- Build deterministic seeded fixtures for breached, clear, and unavailable outcomes; the demo must work without API credentials or network access.
- Normalize provider responses into the shared contract and document source coverage/limitations.
- Keep raw identifiers out of logs, analytics, URLs, and error messages. Do not collect or handle passwords.

## Handoffs
1. Send Atharva the interface/type and a working mock implementation as early as possible.
2. Provide sample responses for all three statuses.
3. Document environment variables and setup without committing secrets.
4. Describe what data is sent to the provider, rate limits, and what “clear” means for that source.

## Done means
- Atharva can call the checker without depending on provider-specific response formats.
- Demo fixtures reliably show breached, clear, and unknown states.
- Provider failures map to unknown, with safe messaging.
- No passwords or leaked secret values are collected, stored, or displayed.
- README/setup notes explain whether a result came from fixtures or a live source.

## Keep out of scope
Do not build a password audit, login automation, account recovery, or remediation automation. Do not claim a clear result proves an account is safe.
