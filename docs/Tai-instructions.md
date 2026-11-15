# Tai — City World, NPCs, Streets, and UI Instructions

## Mission
Create the supporting city world and visual presentation for the BreachLink demo. Own streets, NPCs, city props, and UI design/assets. Coordinate with Daniel, who owns the reusable account buildings, and Atharva, who owns frontend implementation and integration.

## Step-by-step prompting workflow
Use these prompts in order, sharing the relevant agreed conventions and files at each step:
1. **Confirm ownership and conventions:** “Summarize my scope: city layout, streets, NPCs, supporting props, and UI visual design/assets. Identify scene scale, origin, orientation, export format, palette, and UI implementation constraints to confirm with Daniel and Atharva.”
2. **Block out the city:** “Create a lightweight city blockout with streets, walkways, NPC zones, and clear plots for Daniel’s replaceable account buildings. Include approximate dimensions, camera view, and placement notes.”
3. **Design NPCs and street life:** “Add a small set of readable, low-poly NPCs and street details that add life without obscuring account buildings or status markers. Keep geometry and animation browser-friendly.”
4. **Design the UI visuals:** “Propose and prepare the visual treatment for the city UI—status legend, labels, markers, and supporting panels—consistent with the agreed palette and readable at demo size. Hand off design/assets/specifications to Atharva for frontend implementation.”
5. **Integrate and refine:** “Use Atharva’s feedback to fix specific scale, placement, visibility, or UI asset issues. Refine streets, NPCs, props, and visual assets without changing shared conventions.”
6. **Package the handoff:** “Provide exports and a concise handoff listing units, origin, scale, camera/orientation, account building plot coordinates, NPC/prop notes, UI asset specifications, and known limitations.”

At each step, report assumptions before relying on them; do not change shared conventions without coordinating with the team.

## Coordinate with the team first
- Coordinate with Daniel on scale, origin, export format, palette, and reserved account-building plots before detailed work.
- Coordinate with Atharva on UI dimensions, interaction states, frontend constraints, and which visual assets/specifications Atharva will implement.
- Use the frontend's agreed scene orientation and keep the ground plane near world origin.
- Deliver a rough city export and UI visual direction early so Atharva can integrate them while you refine the work.

## Scope
- Create the supporting city block: streets/walkways, NPCs, props, and other environmental details. Daniel owns the account-building models; leave their plots clear and compatible with replaceable instances.
- Create UI visual designs/assets and specifications for Atharva to implement in the frontend. Coordinate boundaries clearly so this does not duplicate app logic or component integration.
- Keep geometry low-poly, animation minimal, and visual assets lightweight; the city must load smoothly in a browser.
- Avoid baking account state into the environment. Status is represented by building materials/markers and UI.

## Handoffs
Provide:
1. Early city blockout/export, UI visual direction, and screenshots.
2. Final streets, NPCs, and supporting world assets in the format agreed with Atharva (prefer GLB if the app uses Three.js).
3. UI visual assets/specifications, including status legend, labels, and marker states, handed off for Atharva’s frontend implementation.
4. Notes with units, origin, scale, camera/orientation suggestion, account building placement coordinates, and any required textures/materials.

## Done means
- Streets and supporting city assets import at the agreed scale and origin; account plots remain clear and visible.
- NPCs and props add context without obscuring account buildings, labels, or status indicators.
- UI visuals are legible and handed off in a form Atharva can implement consistently.
- Assets are lightweight, materials are named, and Atharva confirms the integrated work functions in the app.

## Keep out of scope
Do not build account forms, breach logic, or unique account buildings. UI ownership means visual design/assets; Atharva owns frontend behavior and integration. Ask the team before changing shared scale/origin conventions.
