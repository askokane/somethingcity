# Atharva — Overall Integration Instructions

## Mission
Own the end-to-end Breach City experience and integrate the environment, account buildings, account checker, and interface into a reliable hackathon demo.

## Start immediately
- Establish the app shell and a gray-box city with mock data before Blender assets are ready.
- Publish the shared `AccountCheck` interface from `planning.md` and confirm it with Justin.
- Agree with Tai and Daniel on asset format, scene scale, origin, orientation, and status material names.
- Keep a known-good demo path using seeded fixtures throughout development.

## Scope
- Build the main screen: city, account/status list or legend, add/check controls, and selected-building details.
- Map each account result to a building and show clear, breached, and unknown states in both the city and text UI.
- Integrate Tai's environment and Daniel's reusable building asset when available; preserve the gray-box fallback.
- Display source and check time. Use precise language such as “No known match in this source.”
- Make the demo resettable and ensure the fixture flow works without credentials or network access.
- Prepare the short demo story and coordinate a final feature freeze.

## Parallel handoffs
- Give everyone the interface and asset conventions early; avoid private assumptions about file names or transforms.
- Ask for rough exports early and integrate them before visual polish is complete.
- Keep mock data behind the same interface Justin implements, so swapping fixture/live data does not require rewriting the UI.
- Send concise integration feedback: what imports, what is missing, and the exact expected change.

## Privacy and UX requirements
- Never request passwords. Mask account identifiers in the city and avoid logging raw identifiers.
- Unknown/unavailable must not look like clear.
- Do not show leaked values or claim remediation has happened.
- Ensure status is conveyed with labels/icons as well as color.

## Done means
- A user can add or select a demo account, run/check results, and see the corresponding building state.
- Selecting a building opens the right metadata and practical next steps.
- Clear, breached, and unknown states all work through the same data contract.
- Fixture demo survives missing provider credentials and network failures.
- The app starts cleanly and the demo can be completed in about 90 seconds.
