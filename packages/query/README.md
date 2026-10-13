# @wcpos/query

Low-level reactive read and demand primitives for WCPOS.

The package no longer owns a fluent query model or replication state machine. Engine-backed
screen reads are query handles (`query-handle.ts`: one object per query, shared by every
reader), built by `packages/core/src/query/query-handles.ts`; local logs and receipt templates
remain dedicated local-only paths.

## Public surface

The package root exports:

- `QueryProvider` and `useQueryRuntime` — provide and access the shared runtime dependencies
  `{ localDB, engine, locale }`.
- `observeEngineQuery` and `observeEngineDatabases` — direct engine-resident reads through the
  adapter execution path.
- the query handle (`createQueryHandle`, `acquireQueryHandle`, `createDemand`) and its
  projections, and the requirement declaration/reset-refill helpers the handles use.
- legacy-document boundary functions used by core.
- `useLocalQuery$` and logs-storage recovery for the standalone logs collection.
- `awaitWriteOutcome` for engine mutation acknowledgements.

All other engine-adapter modules are package-private.

## Read ownership

- Engine-backed collections are read from the current engine `db$` resident database.
- Search, targeted-record, and order-query demand is declared through engine requirement handles.
- Coverage-aware totals are projected from engine coverage collections by the query handle.
- Relational product search joins product and variation residents in core's products handle.
- Logs query only `localDB.collections.logs`; receipt templates query their dedicated local
  collection after `useTemplatesSync` performs its best-effort refresh.

## Tests

```bash
cd packages/query
NODE_OPTIONS=--experimental-vm-modules ../../node_modules/.bin/jest --runInBand
```
