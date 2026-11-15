# Justin — Account Infrastructure Instructions

## Mission
Build the account entry and breach-check layer for the BreachLink demo. It should accept user-authorized account identifiers, return a safe normalized result, and remain demoable when a live provider is unavailable.

## Step-by-step prompting workflow
Use these prompts in order, sharing the current interface and setup details as they become available:
1. **Confirm the contract:** “Review the `AccountCheck` contract and propose the smallest checker API, input rules, and ownership split with Atharva. Flag any ambiguity before implementing.”
2. **Build the fixture path:** “Implement deterministic fixtures for clear, breached, and unknown outcomes behind the agreed API. Include safe masked labels and sample responses; make this work without network access or credentials.”
3. **Add validation and normalization:** “Implement account identifier validation, masking, and normalization into `AccountCheck`. Keep raw identifiers out of logs, URLs, analytics, and errors.”
4. **Add an approved live adapter if feasible:** “Inspect the approved provider requirements and implement an adapter only if credentials and time allow. Map failures, timeouts, rate limits, and partial results to `unknown`; document exactly what is sent and source coverage.”
5. **Handoff and integrate:** “Provide Atharva the API/type, fixture examples, setup/environment variable notes, provider limitations, and a concise integration example. Address integration feedback while preserving the stable contract.”

At each step, distinguish confirmed provider behavior from assumptions; never treat a failed or incomplete lookup as clear.

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
