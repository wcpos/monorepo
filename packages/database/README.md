# @wcpos/database

Local RxDB database for WCPOS with custom plugins for collection management and full-text search.

## Overview

This package provides:

- **Database factories**: Create user, store, and sync databases
- **Collection schemas**: Define data structures for WooCommerce entities
- **RxDB plugins**: Custom plugins for collection reset and search

## Database Types

### Store Database

Primary database for WooCommerce data:

```typescript
import { createStoreDB } from '@wcpos/database';

const storeDB = await createStoreDB({ name: 'store_123' });

// Collections: products, variations, orders, customers, taxes, 
// products/categories, products/tags, logs
```

### Fast Store Database (Sync State)

Tracks sync status for each record:

```typescript
import { createFastStoreDB } from '@wcpos/database';

const fastStoreDB = await createFastStoreDB({ name: 'fast_store_123' });

// Collections mirror storeDB but store sync metadata
```

### User Database

Stores user settings and site configurations:

```typescript
import { createUserDB } from '@wcpos/database';

const userDB = await createUserDB({ name: 'user' });

// Collections: users, sites, wp_credentials, logs
```

## Plugins

### Reset Collection Plugin

Automatically re-creates collections after removal. This enables O(1) collection clearing regardless of record count.

**How it works:**

1. When a collection is removed, the plugin intercepts the `postCloseRxCollection` hook
2. It re-adds the collection with the same schema
3. It emits the new collection on `storeDB.reset$`

**Usage:**

```typescript
// The plugin adds reset$ observable to RxDatabase
storeDB.reset$.subscribe((collection) => {
  console.log(`Collection ${collection.name} was reset`);
});

// To clear a collection (use swapCollection from @wcpos/query for proper cleanup)
await collection.remove(); // Plugin automatically re-creates it
```

**Managed collections:**

The plugin only manages known collections (products, orders, customers, etc.). It skips:

- FlexSearch index collections (handled by search plugin)
- Unknown/custom collections

**Debug logging:**

```
wcpos.db.reset - Plugin lifecycle events
```

### Search Plugin

Provides FlexSearch full-text search with locale support and LRU caching.

**Features:**

- **Locale-aware**: Different search indexes per locale
- **LRU caching**: Keeps max 3 locale indexes in memory
- **Error recovery**: Auto-recreates corrupted indexes
- **Lazy initialization**: Search indexes created on first use

**Usage:**

```typescript
// Initialize search for a collection (usually called by Query)
const searchInstance = await collection.initSearch('en');

// Search returns matching document IDs
const ids = await searchInstance.search('blue shirt');

// Change locale (initializes new index if needed)
await collection.setLocale('de');

// Search with current locale
const results = await collection.search('blaues hemd');

// Manually recreate search index (error recovery)
await collection.recreateSearch('en');
```

**Search fields configuration:**

Collections define searchable fields in their schema options:

```typescript
// In collection schema
{
  options: {
    searchFields: ['name', 'sku', 'description', 'meta_data.value']
  }
}
```

**Error recovery:**

If FlexSearch fails (e.g., schema mismatch after update), the plugin:

1. Logs the error
2. Attempts to destroy the corrupted index collection
3. Creates a fresh index
4. If retry fails, throws the error

**Debug logging:**

```
wcpos.db.search - Search operations and errors
```

## Type Augmentation

The package augments RxDB types with plugin-added properties:

```typescript
// types.d.ts augments these interfaces:

interface RxDatabase {
  reset$?: Observable<RxCollection>; // From reset-collection plugin
}

interface RxCollection {
  initSearch?(locale?: string): Promise<FlexSearchInstance | null>;
  setLocale?(locale: string): Promise<void>;
  search?(query: string): Promise<string[]>;
  recreateSearch?(locale?: string): Promise<FlexSearchInstance | null>;
}
```

## Integration with @wcpos/query

The plugins are designed to work with the query library:

```
@wcpos/query                          @wcpos/database
─────────────                         ───────────────
                                      
swapCollection() ──────────────────► collection.remove()
       │                                     │
       │                              reset-collection plugin
       │                                     │
       ◄──────────────────────────── storeDB.reset$ emits
       │
       └──► Query re-registers with new collection


Query.search() ────────────────────► collection.initSearch()
       │                                     │
       │                              search plugin
       │                                     │
       ◄──────────────────────────── FlexSearchInstance
       │
       └──► searchInstance.search()
```

## Testing

Plugin tests are in `packages/database/src/plugins/`:

```bash
cd packages/database
pnpm test
```

Test files:

- `reset-collection.test.ts` - Collection reset patterns
- `search.test.ts` - Search initialization and caching

## Clearing All Data

To clear all databases (e.g., logout):

```typescript
import { clearAllDB } from '@wcpos/database';

const results = await clearAllDB({ storeDB, fastStoreDB, userDB });
// Returns array of { name, success, error? } for each database
```

## Design Decisions

### Why auto-recreate collections?

RxDB's `collection.remove()` is O(1) - instant regardless of record count. But it leaves the database without the collection. The reset-collection plugin:

1. Makes `remove()` safe to call (collection comes back)
2. Provides `reset$` for components to get new collection reference
3. Enables fast "clear and sync" operations

### Why LRU cache for search?

Users may switch locales. Creating a FlexSearch index is expensive (indexes all documents). LRU caching:

1. Keeps recent locales warm
2. Limits memory usage (max 3 indexes)
3. Evicts least-recently-used on new locale

### Why error recovery for search?

FlexSearch stores its index in a separate RxDB collection. If the schema changes (RxDB update), existing indexes become incompatible. Auto-recovery:

1. Detects initialization failure
2. Destroys corrupted index collection
3. Creates fresh index
4. Prevents broken search from blocking the app

## API Reference

### Database Factories

- `createStoreDB(config)` - Main data database
- `createFastStoreDB(config)` - Sync state database
- `createUserDB(config)` - User settings database
- `createTemporaryDB(config)` - In-memory database for testing

### Exports

- `storeCollections` - Schema definitions for store
- `syncCollections` - Schema definitions for sync state
- `userCollections` - Schema definitions for user
- `clearAllDB(databases)` - Clear all databases

### Types

- `FlexSearchInstance` - Search instance returned by plugin
- `StoreCollections` - Type for store collection map
- `SyncCollections` - Type for sync collection map
