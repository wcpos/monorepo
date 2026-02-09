# TypeScript Strict Migration

## Goal

Enable `strict: true` across the entire monorepo, package-by-package, with CI and pre-commit enforcement so strict packages never regress.

## Strategy

Migrate one package at a time, starting with the cleanest and working toward the most complex. Each package is a standalone PR.

## Migration Order

1. **`packages/query`** — Already strict. Add `typecheck` script, wire into Turbo/CI. Establishes the pattern.
2. **`packages/utils`** — Small, self-contained utilities.
3. **`packages/hooks`** — React hooks, depends on utils.
4. **`packages/components`** — ~27 `any` annotations, mostly props typing.
5. **`packages/core`** — ~88 `any` across 40 files. Biggest effort but straightforward.
6. **`packages/database`** — Core typing is already solid (RxDB generics used correctly). ~10% of `any` usage is fixable, the rest is unavoidable plugin prototype injection or pragmatic dynamic data handling.
7. **`apps/main`** — Only 9 `any` annotations.
8. **`apps/electron`** — Already has `noImplicitAny`, just needs full `strict`.

## Per-Package Workflow

For each package:

1. Enable `strict: true` in the package's `tsconfig.json`
2. Run `tsc --noEmit` and triage every error:
   - **Fix it properly** — Add the correct type (default path)
   - **Create a typed wrapper** — For third-party APIs called from multiple places. The `any` lives inside the wrapper, callers get proper types.
   - **Add `@ts-expect-error: <reason>`** — For one-off edge cases where upstream types are wrong. Always include a reason.
3. Add `"typecheck": "tsc --noEmit"` to the package's `package.json`
4. PR, review, merge

## Enforcement

### Turbo Pipeline

Add `typecheck` to the Turbo config:

```json
"typecheck": {
  "dependsOn": ["^typecheck"]
}
```

Packages without a `typecheck` script are skipped automatically. As each package is migrated, adding the script opts it in.

### CI

Add `pnpm turbo typecheck` as a step in GitHub Actions alongside the existing lint step.

### Pre-commit

Run `turbo run typecheck --filter=...[HEAD]` to only check packages with changed files.

## Type Suppression Policy

- **`@ts-ignore` is banned.** Replace all instances with `@ts-expect-error`.
- **Every `@ts-expect-error` must have a reason** explaining why the suppression exists.
- **Enforced via ESLint:**

```json
"@typescript-eslint/ban-ts-comment": ["error", {
  "ts-ignore": true,
  "ts-expect-error": { "descriptionFormat": "^: .+" }
}]
```

`@ts-expect-error` self-cleans: if the underlying type issue gets fixed (e.g. after a library upgrade), the suppression becomes an error, prompting removal.

## Handling Hard Cases

### RxDB Plugin Prototypes

RxDB's plugin system uses prototype injection (`proto: any`). This is a fundamental limitation — TypeScript cannot type runtime prototype mutations. The existing module augmentation in `types.d.ts` already provides type safety at the consumption side. These `proto: any` parameters get `@ts-expect-error` comments and are left as-is.

### Dynamic API Data

Data from WooCommerce REST APIs is validated at runtime by JSON Schema. `Record<string, any>` is acceptable for data that flows through schema validation before becoming typed RxDB documents.

### Typed Wrappers

For third-party APIs called from multiple files, create thin typed wrappers so the `any` lives in one place:

```typescript
// Wrapper centralizes the type unsafety
function queryCollection<T>(collection: RxCollection<T>, query: MangoQuery<T>): RxQuery<T> {
  // @ts-expect-error: RxDB query builder types don't account for plugin-added operators
  return collection.find(query);
}
```

## Foundation PR

The first PR sets up the infrastructure before any package migration:

- Turbo `typecheck` pipeline task
- CI workflow step
- Pre-commit hook
- ESLint `ban-ts-comment` rule
- `packages/query` typecheck script (already strict, just needs the script)
