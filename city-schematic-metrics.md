# Breach City — Baseline Schematic Metrics

## Purpose

Shared gray-box dimensions for the environment, reusable account buildings, and browser scene. These are proposed defaults for kickoff; the team can revise them, but should keep one agreed set across all workstreams.

## Baseline metrics

| Item | Baseline | Convention |
|---|---:|---|
| Scene units | 1 unit = 1 meter | Apply consistently to Blender exports and browser scene |
| City footprint | 30 × 30 units | Ground centered at world `(0, 0, 0)`; ground plane at `Y = 0` |
| Account plots | 3 × 3 plots (9 total) | Plot centers at `X,Z ∈ {-8, 0, 8}`; each plot is 5 × 5 units |
| Streets | 3 units wide | Keep clear corridors between plot edges; no building may overlap a street |
| Placeholder building | 4 × 4 × 6 units (W × D × H) | Pivot/origin at bottom center; base rests at `Y = 0` |
| Building spacing | 8 units center-to-center | One reusable model; reserve a visible status marker above/near roofline |
| Default camera | Orthographic, `(24, 28, 24)` looking at `(0, 0, 0)` | Adjust framing to fit the full ground with a small margin; keep plot labels legible |
| Status labels | `clear`, `breached`, `unknown` | Use these exact names across data, UI, and asset/material mapping |

## Coordinate convention

Use `Y` as up and `X/Z` as the ground plane. A plot coordinate `(x,z)` means the building pivot sits at `(x,0,z)`. If the layout needs more than nine accounts, extend the grid in eight-unit increments and keep the same plot and building dimensions. Exported assets should preserve these units and pivots; do not apply a per-instance scale to compensate for mismatched exports.

## Team confirmation

Atharva, Daniel, and Tai should confirm or revise these proposed defaults at kickoff before detailed modeling. Record agreed changes here so all workstreams use one schematic.
