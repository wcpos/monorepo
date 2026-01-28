# @wcpos/query

Query and replication library for WCPOS. Syncs WooCommerce REST API data to a local RxDB database and provides a reactive query engine.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         QueryProvider                                │
│  (React Context - provides Manager instance to component tree)       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           Manager                                    │
│  - Singleton per storeDB instance                                    │
│  - Registers/deregisters Query and CollectionReplicationState        │
│  - Handles collection reset cleanup                                  │
│  - Manages AbortController for cancellation                          │
└─────────────────────────────────────────────────────────────────────┘
                          │                    │
              ┌───────────┘                    └───────────┐
              ▼                                            ▼
┌─────────────────────────────┐          ┌─────────────────────────────┐
│     Query / RelationalQuery │          │  CollectionReplicationState  │
│  - Wraps RxDB queries       │          │  - Syncs with WC REST API    │
│  - Search integration       │          │  - Uses SyncStateManager     │
│  - Reactive results         │          │  - Handles HTTP requests     │
└─────────────────────────────┘          └─────────────────────────────┘
              │                                            │
              ▼                                            ▼
┌─────────────────────────────┐          ┌─────────────────────────────┐
│        RxDB Collection       │          │       SyncStateManager       │
│  (local database)            │          │  - Tracks sync status        │
│                              │          │  - Manages full audit        │
└─────────────────────────────┘          └─────────────────────────────┘
```

## Core Concepts

### 1. Manager

The `Manager` is a singleton (per storeDB) that coordinates all queries and replications:

```typescript
const manager = useQueryManager();

// Register a query
const query = manager.registerQuery({
  collectionName: 'products',
  queryKeys: { collection: 'products' },
});

// Register replication
const replication = manager.registerCollectionReplication({
  collection: productsCollection,
  httpClient,
  endpoint: 'products',
});
```

### 2. Query and RelationalQuery

`Query` wraps RxDB queries with additional features:

- **Search**: Full-text search via FlexSearch plugin
- **Reactive results**: Observable streams of query results
- **Query builder**: Chainable `.where()`, `.sort()`, etc.
- **Cancellation**: AbortController integration

`RelationalQuery` extends `Query` for parent-child relationships (e.g., products and variations):

```typescript
const { query, childQuery } = useRelationalQuery({
  parentQueryProps: {
    collectionName: 'products',
    queryKeys: { collection: 'products' },
  },
  childQueryProps: {
    collectionName: 'variations',
    queryKeys: { collection: 'variations' },
    endpoint: 'products/variations',
  },
});

// Search finds products that match OR have matching variations
query.search('blue shirt');
```

### 3. Collection Replication

`CollectionReplicationState` handles synchronization with the WooCommerce REST API:

- **Full audit**: Fetches all remote IDs and compares with local
- **Incremental sync**: Fetches recently modified records
- **On-demand fetch**: Immediate fetch for user actions
- **Conflict resolution**: Server wins by default

### 4. Sync State Management

`SyncStateManager` tracks the sync status of each record:

- `SYNCED`: Local matches remote
- `PULL_NEW`: New record on server, needs fetch
- `PULL_UPDATE`: Remote is newer, needs fetch
- `PUSH_UPDATE`: Local is newer, needs push

## Collection Reset (Swap)

When users need to clear a collection (e.g., "Clear and Sync"), use `swapCollection`:

```typescript
import { swapCollection, swapCollections } from '@wcpos/query';

// Single collection
const result = await swapCollection({
  manager,
  collectionName: 'products',
  storeDB,
  fastStoreDB, // optional sync database
});

// Multiple collections (e.g., products + variations)
const results = await swapCollections({
  manager,
  collectionNames: ['variations', 'products'], // order matters
  storeDB,
  fastStoreDB,
});
```

**Why swapCollection instead of deleteAll?**

- `deleteAll()` is O(n) - slow for 100k+ records
- `collection.remove()` is O(1) - instant regardless of size
- `swapCollection` cancels all queries/replications first
- The `reset-collection` plugin automatically re-creates the collection

**Flow:**

```
swapCollection()
    ├── manager.onCollectionReset() 
    │       ├── Cancel all queries for collection
    │       ├── Cancel all replications for collection
    │       └── Abort in-flight HTTP requests
    ├── collection.remove() (instant)
    ├── reset-collection plugin re-creates collection
    └── Emit on storeDB.reset$ (hooks receive new collection)
```

## UI Responsiveness

For large datasets, use yield utilities to prevent UI blocking:

```typescript
import { yieldToEventLoop, processInChunks, chunkedIterator } from '@wcpos/query';

// Yield between operations
await yieldToEventLoop();

// Process array in chunks with progress
await processInChunks(
  items,
  async (chunk) => { /* process chunk */ },
  1000, // chunk size
  (progress) => console.log(`${progress.percent}% complete`)
);

// Async generator for streaming
for await (const { chunk, isLast } of chunkedIterator(items, 1000)) {
  await processChunk(chunk);
}
```

## Cancellation

All queries and replications support cancellation via AbortController:

```typescript
// Cancel a single query
await query.cancel();

// Cancel entire manager (all queries + replications)
await manager.cancel();

// Check cancellation status
if (query.isAborted) { return; }

// Use signal in fetch requests
fetch(url, { signal: query.signal });
```

## Debug Logging

The library uses `@wcpos/utils/logger` for structured logging:

```typescript
// Logs are namespaced:
// - wcpos.query.manager - Manager lifecycle
// - wcpos.query.state - Query operations
// - wcpos.query.relational - RelationalQuery search
// - wcpos.query.sync - Sync operations

// Enable debug logging via logger configuration
```

## Testing

Tests are in `packages/query/tests/`. Run with:

```bash
cd packages/query
npx jest --config jest.config.cjs
```

Key test files:

- `lifecycle.test.ts` - Manager/Query lifecycle and cleanup
- `collection-swap.test.ts` - Collection reset functionality
- `relational-query-state.test.ts` - Parent-child search
- `performance.test.ts` - Large dataset handling

## Dependencies

- **@wcpos/database**: RxDB setup and plugins
  - `reset-collection` plugin: Auto re-creates collections after removal
  - `search` plugin: FlexSearch integration with locale support
- **RxJS**: Reactive streams
- **RxDB**: Local database

## Design Decisions

### Why separate Query and Replication?

Queries and replications have different lifecycles:

- **Query**: Lives as long as the UI component needs it
- **Replication**: Lives as long as the collection needs syncing

This separation allows multiple queries to share one replication, and queries can exist without replication (e.g., local-only logs).

### Why Manager singleton?

One Manager per storeDB ensures:

- Queries are deduplicated (same queryKeys = same Query instance)
- Collection reset can cancel all related operations
- Resource cleanup is centralized

### Why AbortController?

HTTP requests should be cancelled when:

- Query is cancelled (component unmounts)
- Collection is reset (user clears data)
- Manager is cancelled (database switch)

AbortController provides a standard way to propagate cancellation.

### Why yield utilities?

Processing 100k+ records synchronously blocks the UI. Yielding between chunks allows:

- UI to remain responsive
- Other events to be processed
- Progress updates to be shown

## API Reference

### Hooks

- `useQueryManager()` - Get Manager instance
- `useQuery(props)` - Create/get a Query
- `useRelationalQuery(props)` - Create/get parent-child Query pair
- `useLocalQuery(props)` - Query without replication
- `useReplicationState(endpoint)` - Get replication state

### Classes

- `Manager` - Coordinates queries and replications
- `Query` - Wraps RxDB query with search and cancellation
- `RelationalQuery` - Query with parent-child search
- `CollectionReplicationState` - Syncs collection with REST API
- `SyncStateManager` - Tracks sync status per record

### Functions

- `swapCollection(config)` - Safely reset a collection
- `swapCollections(config)` - Reset multiple collections
- `yieldToEventLoop()` - Yield to event loop
- `processInChunks(items, processor, size)` - Process array in chunks
- `chunkedIterator(items, size)` - Async generator for chunks

## Future Architecture: State Machine & Offline Support

> **TODO**: This section describes planned architecture improvements for offline support.

### Current Limitation

The query/replication lifecycle is currently **implicit** - states and transitions are spread across Manager, Query, and hooks without a central definition. This works for online-only operation but becomes problematic for offline support.

### Proposed: Explicit State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Query Lifecycle States                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────┐    REGISTER    ┌────────────┐    SUBSCRIBE   ┌────────┐  │
│   │ idle │ ──────────────▶│  paused    │ ─────────────▶ │ active │  │
│   └──────┘                └────────────┘                └────────┘  │
│                                 │  ▲                        │       │
│                                 │  │ UNSUBSCRIBE            │       │
│                                 │  └─────────────────────────       │
│                                 │                                   │
│                           CANCEL│                                   │
│                                 ▼                                   │
│                          ┌────────────┐                             │
│                          │ cancelled  │                             │
│                          └────────────┘                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

For offline support, we'd extend this with:

```typescript
type QueryState = 
  | 'idle'
  | 'registering'
  | 'active'           // Online, syncing normally
  | 'paused'           // No subscribers
  | 'offline'          // Network unavailable
  | 'queued'           // Has pending mutations to sync
  | 'syncing'          // Pushing queued changes
  | 'cancelling'
  | 'cancelled';

type QueryEvent = 
  | { type: 'REGISTER' }
  | { type: 'SUBSCRIBE' }
  | { type: 'UNSUBSCRIBE' }
  | { type: 'NETWORK_OFFLINE' }
  | { type: 'NETWORK_ONLINE' }
  | { type: 'MUTATION_QUEUED'; payload: MutationPayload }
  | { type: 'SYNC_COMPLETE' }
  | { type: 'SYNC_ERROR'; error: Error }
  | { type: 'COLLECTION_RESET' }
  | { type: 'CANCEL' };
```

### Offline Support Requirements

1. **Detect network status** - Listen to `navigator.onLine` and connection events
2. **Queue mutations** - Store create/update/delete operations locally when offline
3. **Sync on reconnect** - Push queued mutations when network returns
4. **Conflict resolution** - Handle cases where server data changed while offline
5. **UI feedback** - Show sync status, pending changes count, last sync time

### Order Creation Flow (Offline-Capable)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Order Creation Flow                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User creates order                                                  │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────┐                                                 │
│  │ Save to RxDB    │ ◀─── Always succeeds (local-first)              │
│  │ (local)         │                                                 │
│  └────────┬────────┘                                                 │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐     Online?     ┌─────────────────┐            │
│  │ Check network   │ ───────────────▶│ Push to server  │            │
│  │ status          │                  │ immediately     │            │
│  └────────┬────────┘                  └─────────────────┘            │
│           │                                                          │
│           │ Offline                                                  │
│           ▼                                                          │
│  ┌─────────────────┐                                                 │
│  │ Queue mutation  │ ◀─── Store in sync queue collection             │
│  │ for later sync  │                                                 │
│  └────────┬────────┘                                                 │
│           │                                                          │
│           │ Network restored                                         │
│           ▼                                                          │
│  ┌─────────────────┐                                                 │
│  │ Process queue   │ ◀─── FIFO, retry with backoff                   │
│  │ (oldest first)  │                                                 │
│  └─────────────────┘                                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Implementation Considerations

- **XState** - Battle-tested state machine library, good DevTools
- **Sync queue collection** - New RxDB collection to persist pending mutations
- **Optimistic UI** - Show local changes immediately, reconcile after sync
- **Idempotency** - Server endpoints must handle duplicate requests gracefully

### References

- [XState Documentation](https://xstate.js.org/)
- [Local-First Software](https://www.inkandswitch.com/local-first/)
- [RxDB Offline Replication](https://rxdb.info/replication.html)
