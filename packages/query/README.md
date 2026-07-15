# @wcpos/query

Low-level reactive read and demand primitives for WCPOS.

The package no longer owns a fluent query model or replication state machine. Engine-backed
screen reads are composed by `packages/core/src/query/query-bindings.ts`; local logs and receipt
templates remain dedicated local-only paths.

## Public surface

The package root exports:

- `QueryProvider`, `useQueryManager`, and `QueryRuntime` — the shared runtime dependencies. The
  historical hook name returns a plain `{ localDB, engine, locale, httpClient }` value.
- `observeEngineQuery` and `observeEngineDatabases` — direct engine-resident reads through the
  adapter execution path.
- requirement declaration/reset-refill helpers used by core bindings.
- `useLocalQuery` and logs-storage recovery for the standalone logs collection.
- `useTemplatesSync` for the dedicated local receipt-template fetch target.
- `awaitWriteOutcome` for engine mutation acknowledgements.

Two explicit subpaths exist:

- `@wcpos/query/engine-compat` exposes the legacy-document boundary functions needed by core.
- `@wcpos/query/requirements` exposes the declarative demand bridge to isolated direct readers.

All other engine-adapter modules are package-private.

## Read ownership

- Engine-backed collections are read from the current engine `db$` resident database.
- Search, targeted-record, and order-query demand is declared through engine requirement handles.
- Coverage-aware totals are projected from engine coverage collections by core bindings.
- Relational product search joins product and variation residents in the core binding layer.
- Logs query only `localDB.collections.logs`; receipt templates query their dedicated local
  collection after `useTemplatesSync` performs its best-effort refresh.

## Tests

```bash
cd packages/query
NODE_OPTIONS=--experimental-vm-modules ../../node_modules/.bin/jest --runInBand
```
