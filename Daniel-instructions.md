# Daniel — Blender Account Building Instructions

## Mission
Own the account-building models for Breach City. Each monitored account maps to one reusable building, and the app changes its appearance to reflect the account's breach-check status. Tai owns streets, NPCs, supporting city elements, and UI visual design/assets; Atharva owns frontend implementation.

## Step-by-step prompting workflow
Use these prompts in order, carrying forward the conventions agreed with Tai and Atharva:
1. **Confirm asset conventions:** “Summarize the building requirements and list the agreed dimensions, origin/pivot, orientation, export format, camera distance, and material names. Identify anything I need to confirm before modeling.”
2. **Create a placeholder:** “Make a simple, low-poly placeholder account building that matches the agreed conventions. Export it with a screenshot and enough notes for Atharva to instance it in the gray-box scene.”
3. **Design status states:** “Propose clear, breached, and unknown treatments using named material slots or variants. Ensure each is distinguishable at the demo camera distance and status is not conveyed by color alone where feasible.”
4. **Refine the reusable model:** “Refine the placeholder silhouette and visible details while keeping geometry lightweight and preserving the agreed origin, scale, orientation, and state mapping.”
5. **Package and verify handoff:** “Export the final reusable asset. Provide exact material/state names, dimensions, pivot/orientation, import notes, and any animation or lighting requirements. Incorporate Atharva’s integration feedback.”

Keep account names and sensitive information out of the asset; retain a static version as a fallback.

## Coordinate with the team first
- Coordinate with Tai on streets, reserved building plots, NPCs, palette, and scene scale; coordinate with Atharva on frontend import, origin/pivot, orientation, export format, and material naming.
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
