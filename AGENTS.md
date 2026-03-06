# Pi Shell

Pi extension that makes `!` and `!!` commands behave like a real shell — tab completion, cd tracking, aliases.

TypeScript pi extension loaded by pi via jiti (no separate build step).

For the full design, see specs/vision.md and specs/requirements.md.

## Workflow

After EVERY code change, run `npm test` — this runs `tsc --noEmit` then `vitest run`. Both must pass before moving on. No exceptions.

## Key files

- `src/index.ts` — extension entry point (registered in package.json `pi.extensions`)
- `src/types.ts` — local type definitions for types not re-exported by pi
- `specs/` — vision, requirements, and design docs
