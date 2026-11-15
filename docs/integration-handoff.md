# BreachLink Integration Handoff

Use this as the shared reference when connecting the checker and exported art to the frontend. The gray-box app can continue independently against fixtures.

## Checker interface

```ts
export type AccountCheck = {
  id: string;
  label: string; // Masked display value, e.g. a***@example.test
  checkedAt: string | null; // ISO 8601 timestamp, or null when not checked
  status: "clear" | "breached" | "unknown";
  breaches: Array<{
    name: string;
    date: string | null;
    exposedData: string[];
  }>;
  source: string;
  error?: string; // Safe, user-readable explanation
};

export type AccountChecker = (accountId: string) => Promise<AccountCheck>;
```

Integration rules:

- The frontend calls the checker through `AccountChecker`; fixture and provider implementations must return the same shape.
- Timeout, rate limit, missing configuration, provider error, or partial/unavailable result maps to `status: "unknown"`, never `clear`.
- `clear` means only “No known match in this source.” Include the source and check time in the report.
- Do not log or return raw account identifiers, passwords, leaked values, or sensitive breach records. The display label is masked.
- The local fixture implementation must work without network access or provider credentials.

## Scene and asset conventions

| Setting | Shared value |
|---|---|
| Units | 1 unit = 1 meter |
| Up axis / ground plane | Y up; X/Z ground plane |
| World origin | Ground centered at `(0, 0, 0)`; ground at `Y = 0` |
| City footprint | 30 × 30 units |
| Account plots | 3 × 3; centers at `X,Z ∈ {-8, 0, 8}`; plot size 5 × 5 units |
| Placeholder building | 4 × 4 × 6 units (W × D × H); pivot at bottom center; base at `Y = 0` |
| Building spacing | 8 units center-to-center |
| Status names | `clear`, `breached`, `unknown` |

Export/import notes:

- Confirm each asset's format, origin, orientation, scale, and material names with its owner before final integration. The schematic metrics are proposed defaults and require team confirmation.
- Keep the building pivot at the plot center and base at ground level. Do not compensate for mismatched exports with per-instance scaling.
- Keep a visible status cue near the roof. Status must also be named in text and represented with an icon or label, not color alone.
- Keep the gray-box geometry available as a fallback until the imported scene is confirmed in the complete flow.

## Integration acceptance checklist

- [ ] Fixture and provider checker use the same `AccountCheck` interface.
- [ ] A demo account can be added or selected, checked, and reset without credentials or network access.
- [ ] `clear`, `breached`, and `unknown` appear distinctly in both the city and account/report UI.
- [ ] Selecting a building opens its matching masked label, status, source, timestamp, and available breach metadata.
- [ ] Unknown results never appear clear; errors use safe, readable text.
- [ ] Multiple building instances use the same agreed pivot and scale, and the gray-box fallback remains usable.
- [ ] The walkthrough fits the 90-second demo and includes all three states and the privacy boundary.

## Handoffs to confirm

- **Justin:** checker function signature, fixture result examples, timestamp format, and provider error mapping.
- **Tai:** city/UI asset formats, scene transform, and status visual specifications.
- **Daniel:** building export format, pivot/origin, dimensions, and status material or variant mapping.
- **Atharva:** import results, any contract mismatches, exact owner and change needed, and the next integration checkpoint.
