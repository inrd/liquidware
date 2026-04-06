# AGENTS

- The goal of this project is to become a tool for creating retro CGI renders.
- Prioritize retro CGI atmosphere and stylization over modern realism when making rendering and visual design decisions.
- Keep the app minimal and browser-first.
- Prefer TypeScript, Vite, and direct WebGPU over extra frameworks.
- Do not add heavy abstractions unless they clearly pay for themselves.
- Controls that only affect scene editing should be hidden while the app is in render view.
- Edit-mode controls in the toolbar are organized as exclusive accordion sections (only one open at a time). New edit-mode panels should be added as additional accordion sections following the same pattern in `src/app/bootstrap.ts`.
- Add or update unit tests when introducing pure math or other deterministic render helpers.
- Never add absolute local filesystem paths to repo files; use relative paths or neutral references instead.
- Keep `README.md` up to date when important user-facing behavior, controls, setup, or workflow changes.
- Keep this file up to date as requirements, constraints, and project steering evolve.
