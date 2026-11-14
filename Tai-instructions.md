# Tai — Blender Environment Instructions

## Mission
Create the environment asset for the Breach City hackathon demo: a compact city base that makes account status feel visible at a glance.

## Step-by-step prompting workflow
Use these prompts in order, sharing the relevant agreed conventions and files at each step:
1. **Confirm the brief:** “Summarize the environment requirements, constraints, and open questions. List the scale, origin, orientation, export format, and palette decisions I need to confirm with Daniel and Atharva before modeling.”
2. **Plan the blockout:** “Propose a low-poly city block layout with enough visible plots for the demo accounts. Include approximate dimensions, plot coordinates, camera view, and a short asset checklist.”
3. **Make the gray box:** “Create the simplest usable blockout using the agreed conventions. Keep plots open for replaceable account buildings. Export it and provide a screenshot plus import notes.”
4. **Integrate and refine:** “Using Atharva’s integration feedback, fix only the specific scale, placement, visibility, or import issues. Then refine roads and a few lightweight environmental details without changing the agreed conventions.”
5. **Package the handoff:** “Prepare the final export and a concise handoff listing units, origin, scale, camera/orientation, plot coordinates, material/texture requirements, and any known limitations.”

At each step, report assumptions before relying on them; do not change shared conventions without coordinating with the team.

## Coordinate with the team first
- Coordinate with Daniel on scale, origin, export format, and visual palette before detailed modeling.
- Use the frontend's agreed scene orientation and keep the ground plane near world origin.
- Deliver a rough export early so Atharva can integrate the environment while you refine it.

## Scope
- Model a small, readable city block: ground, roads or paths, and a few simple environmental details.
- Keep geometry low-poly and lightweight; the city must load smoothly in a browser.
- Leave clear plots/positions for account buildings. Account buildings are supplied by Daniel and should be replaceable instances.
- Avoid baking account state into the environment. Status is represented by building materials/markers and UI.

## Handoffs
Provide:
1. Early gray-box scene/export and a screenshot.
2. Final environment asset in the format agreed with Atharva (prefer GLB if the app uses Three.js).
3. Notes with units, origin, scale, camera/orientation suggestion, and recommended building placement coordinates.
4. Any textures/materials required, packed or documented.

## Done means
- Environment imports in the browser scene at the agreed scale and origin.
- There are enough distinct plots for the demo accounts, with clear camera visibility.
- Asset is lightweight, materials are named, and the scene has no unnecessary hidden objects.
- Atharva confirms the asset works in the app.

## Keep out of scope
Do not build account forms, breach logic, dashboards, or unique building models. Ask Atharva before changing shared scale/origin conventions.
