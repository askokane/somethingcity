# Daniel — Blender Account Building Instructions

## Mission
Create the reusable account-building asset for Breach City. Each monitored account maps to one building, and the app changes its appearance to reflect the account's breach-check status.

## Coordinate with the team first
- Coordinate with Tai and Atharva on scene scale, origin/pivot, orientation, export format, and material naming.
- Deliver a placeholder building quickly so Atharva can build the scene before the polished model is ready.

## Scope
- Create one recognizable, low-poly building that can be instanced for multiple accounts.
- Provide three visually distinct status treatments: clear, breached, and unknown/unavailable. Prefer material variants or named material slots so the app can switch states without swapping geometry.
- Use readable silhouettes and avoid tiny details that disappear at the demo camera distance.
- Do not put account names or sensitive information into textures or geometry.

## Handoffs
Provide:
1. Early placeholder export and screenshot.
2. Final reusable building asset in the format agreed with Atharva (prefer GLB if the app uses Three.js).
3. Material/state mapping with exact names, for example `status_clear`, `status_breached`, and `status_unknown`.
4. Notes on dimensions, origin/pivot, orientation, and any animation or lighting requirements.

## Done means
- The asset can be duplicated for multiple accounts without visual or performance problems.
- The three states remain distinguishable at the actual camera distance and are not communicated by color alone where feasible (e.g. alert marker for breach).
- Materials are named and easy to switch from code.
- Atharva confirms all states work in the integrated app.

## Keep out of scope
Do not implement account tracking, breach lookup, or frontend interactions. Keep a simple static version available in case animation integration is cut.
