/**
 * views.ts — Facade / barrel file for the modular views architecture.
 *
 * All View definitions, categories, evaluation logic, and gap badge utilities
 * are now modularized under `./views/`:
 *   - `./views/types.ts`      — Core TypeScript types and interfaces
 *   - `./views/registry.ts`   — VIEWS array registry, passesView, and tree builders
 *   - `./views/gapBadges.ts`  — Gap badge computation and label helpers
 *   - `./views/utils.ts`      — CPR classification and helper functions
 *   - `./views/categories/`   — Modularized category pattern arrays
 *
 * This file re-exports everything from `./views/index` to maintain 100% backward
 * compatibility for all existing imports across the application.
 */

export * from "./views/index";
