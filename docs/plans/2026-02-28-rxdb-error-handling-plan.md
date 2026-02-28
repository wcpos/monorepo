# RxDB Error Handling Overhaul — Implementation Plan

> **For Claude:** REQUIRED: Use /execute-plan to implement this plan task-by-task.

**Goal:** Stop raw RxDB error dumps from reaching users. Fix known bugs at source, add a safety net for anything we miss, redact sensitive data, and give users a silent log badge instead of cryptic JSON.

**Architecture:** Fix three known bugs (null IDs in populate, credential write conflicts, schema validation during sync). Add a `redactSensitiveFields` utility in the logger. Wrap the RxDB storage adapter to catch/translate errors that slip through. Change sync error logging from `showToast: true` to silent. Add an error badge on the Logs drawer item.

**Tech Stack:** RxDB, RxJS, TypeScript, React Native, Expo Router, Jest

---

### Task 1: Add new error codes for RxDB error categories

**Files:**
- Modify: `packages/utils/src/logger/error-codes.ts`
- Modify: `packages/utils/src/logger/error-codes.test.ts`

**Step 1: Write the failing test**

Add to `packages/utils/src/logger/error-codes.test.ts` inside the `'should have database error codes'` block:

```typescript
expect(ERROR_CODES.WRITE_CONFLICT).toBe('DB02007');
expect(ERROR_CODES.SCHEMA_VALIDATION_FAILED).toBe('DB03005');
expect(ERROR_CODES.STORAGE_ERROR).toBe('DB01004');
expect(ERROR_CODES.WORKER_CONNECTION_LOST).toBe('DB01005');
```

**Step 2: Run test to verify it fails**

Run: `cd packages/utils && npx jest error-codes.test.ts -v`
Expected: FAIL — properties don't exist on ERROR_CODES

**Step 3: Add the new error codes**

In `packages/utils/src/logger/error-codes.ts`, add to the `DB_ERRORS` object after the existing entries:

```typescript
DB_UPSERT_FAILED: 'DB02005',
DB_REMOVE_MISMATCH: 'DB02006',
WRITE_CONFLICT: 'DB02007',
SCHEMA_VALIDATION_FAILED: 'DB03005',
STORAGE_ERROR: 'DB01004',
WORKER_CONNECTION_LOST: 'DB01005',
```

**Step 4: Run test to verify it passes**

Run: `cd packages/utils && npx jest error-codes.test.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/utils/src/logger/error-codes.ts packages/utils/src/logger/error-codes.test.ts
git commit -m "feat: add RxDB-specific error codes for conflict, schema, storage, and worker errors"
```

---

### Task 2: Add redactSensitiveFields utility

**Files:**
- Create: `packages/utils/src/logger/redact.ts`
- Create: `packages/utils/src/logger/redact.test.ts`

**Step 1: Write the failing tests**

Create `packages/utils/src/logger/redact.test.ts`:

```typescript
import { redactSensitiveFields } from './redact';

describe('redactSensitiveFields', () => {
	it('should redact access_token at top level', () => {
		const input = { access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdef' };
		const result = redactSensitiveFields(input);
		expect(result.access_token).toBe('eyJhbG...bcdef');
	});

	it('should redact refresh_token at top level', () => {
		const input = { refresh_token: 'abc123def456ghi789' };
		const result = redactSensitiveFields(input);
		expect(result.refresh_token).toBe('abc123...hi789');
	});

	it('should redact jwt_token at top level', () => {
		const input = { jwt_token: 'short' };
		const result = redactSensitiveFields(input);
		expect(result.jwt_token).toBe('[REDACTED]');
	});

	it('should redact nested sensitive fields', () => {
		const input = {
			writeRow: {
				document: {
					access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
					username: 'testuser',
				},
			},
		};
		const result = redactSensitiveFields(input);
		expect(result.writeRow.document.access_token).toMatch(/^\w{6}\.{3}\w{5}$/);
		expect(result.writeRow.document.username).toBe('testuser');
	});

	it('should handle arrays', () => {
		const input = { items: [{ access_token: 'abcdefghijklmnop' }] };
		const result = redactSensitiveFields(input);
		expect(result.items[0].access_token).toBe('abcdef...lmnop');
	});

	it('should return primitives unchanged', () => {
		expect(redactSensitiveFields('hello')).toBe('hello');
		expect(redactSensitiveFields(42)).toBe(42);
		expect(redactSensitiveFields(null)).toBe(null);
	});

	it('should not mutate the original object', () => {
		const input = { access_token: 'original_token_value_here' };
		redactSensitiveFields(input);
		expect(input.access_token).toBe('original_token_value_here');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/utils && npx jest redact.test.ts -v`
Expected: FAIL — module not found

**Step 3: Implement the redact utility**

Create `packages/utils/src/logger/redact.ts`:

```typescript
const SENSITIVE_KEYS = new Set([
	'access_token',
	'refresh_token',
	'jwt_token',
	'token',
	'password',
	'secret',
]);

/**
 * Mask a string value: show first 6 + last 5 chars, or [REDACTED] if too short.
 */
function maskValue(value: string): string {
	if (value.length <= 12) return '[REDACTED]';
	return `${value.slice(0, 6)}...${value.slice(-5)}`;
}

/**
 * Recursively redact sensitive fields from an object.
 * Returns a new object — does not mutate the original.
 */
export function redactSensitiveFields(obj: any): any {
	if (obj == null || typeof obj !== 'object') return obj;

	if (Array.isArray(obj)) {
		return obj.map((item) => redactSensitiveFields(item));
	}

	const result: Record<string, any> = {};
	for (const key of Object.keys(obj)) {
		const value = obj[key];
		if (SENSITIVE_KEYS.has(key) && typeof value === 'string') {
			result[key] = maskValue(value);
		} else if (typeof value === 'object' && value !== null) {
			result[key] = redactSensitiveFields(value);
		} else {
			result[key] = value;
		}
	}
	return result;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/utils && npx jest redact.test.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/utils/src/logger/redact.ts packages/utils/src/logger/redact.test.ts
git commit -m "feat: add redactSensitiveFields utility for token masking in error logs"
```

---

### Task 3: Integrate redaction into the logger

**Files:**
- Modify: `packages/utils/src/logger/index.ts`

**Step 1: Import and apply redaction**

In `packages/utils/src/logger/index.ts`, add the import at the top:

```typescript
import { redactSensitiveFields } from './redact';
```

Then in `mainTransport`, after the options are parsed (around line 141), redact the context before it's used anywhere:

```typescript
// Redact sensitive fields from context before any output
if (options.context) {
	options = { ...options, context: redactSensitiveFields(options.context) };
}
```

This sits before the console log (line 158), toast (line 163), and DB save (line 221), so all three channels get redacted data.

**Step 2: Run logger tests to verify nothing breaks**

Run: `cd packages/utils && npx jest index.test.ts -v`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/utils/src/logger/index.ts
git commit -m "feat: integrate sensitive field redaction into all logger output channels"
```

---

### Task 4: Filter null IDs in populate plugin

**Files:**
- Modify: `packages/database/src/plugins/populate.ts`
- Modify: `packages/database/src/plugins/populate.test.ts`

**Step 1: Write the failing test**

Add to `packages/database/src/plugins/populate.test.ts`:

```typescript
it('handles null IDs in the reference array without crashing', async () => {
	const nestedCollection = await create(0);
	const childData = generateNested();
	// Insert a valid child first
	await nestedCollection.insert(childData as any);

	// Insert a parent with a mix of valid, null, undefined, and empty string IDs
	const parentData = {
		...generateNested(),
		child: [childData.uuid, null, undefined, ''],
	};

	// The preInsert hook may strip non-objects, so insert the parent with raw IDs
	// We need to test the populate$ path specifically
	const doc = await nestedCollection.insert({
		uuid: parentData.uuid,
		name: parentData.name,
		child: [childData.uuid],
	} as any);

	// Manually patch in null IDs to simulate bad data
	await doc.incrementalPatch({ child: [childData.uuid, null as any, '' as any] });
	const latest = doc.getLatest();

	const children = await latest.populate('child');
	expect(children.length).toBe(1);
	expect(children[0].uuid).toBe(childData.uuid);
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && npx jest populate.test.ts -v`
Expected: FAIL — `findByIds` throws on null key

**Step 3: Fix the populate$ method**

In `packages/database/src/plugins/populate.ts`, line 144-146, change the `get$` + `switchMap` to filter null IDs:

Replace:
```typescript
return this.get$(key).pipe(
	distinctUntilChanged(isEqual),
	switchMap((ids: string[]) => refCollection.findByIds(ids).exec()),
```

With:
```typescript
return this.get$(key).pipe(
	distinctUntilChanged(isEqual),
	switchMap((ids: string[]) => {
		const validIds = Array.isArray(ids) ? ids.filter((id) => id != null && id !== '') : [];
		if (validIds.length === 0) {
			return combineLatest([]).pipe(startWith([]));
		}
		return refCollection.findByIds(validIds).exec();
	}),
```

Also add `of` to the rxjs import at line 10:

Replace:
```typescript
import { combineLatest } from 'rxjs';
```

With:
```typescript
import { combineLatest, of } from 'rxjs';
```

And for the `validIds.length === 0` case, actually return `of([])` directly to skip the nested switchMap entirely:

```typescript
switchMap((ids: string[]) => {
	const validIds = Array.isArray(ids) ? ids.filter((id) => id != null && id !== '') : [];
	if (validIds.length === 0) return of([]);
	return refCollection.findByIds(validIds).exec();
}),
```

Wait — the next `switchMap` expects a `Map<string, RxDocument>`, and we'd be returning `[]`. We need to handle both branches consistently. The cleaner fix:

Replace the entire populate$ body (lines 144-163):

```typescript
return this.get$(key).pipe(
	distinctUntilChanged(isEqual),
	switchMap((ids: string[]) => {
		const validIds = Array.isArray(ids) ? ids.filter((id) => id != null && id !== '') : [];
		if (validIds.length === 0) return of(new Map() as Map<string, RxDocument>);
		return refCollection.findByIds(validIds).exec();
	}),
	switchMap((docsMap: Map<string, RxDocument>) => {
		const docs = [...docsMap.values()];
		if (docs.length === 0) return of([] as RxDocument[]);

		// Map each lineItem to an observable of its deleted$ property
		const deletedObservables = docs.map((doc) => doc.deleted$);

		// Combine the observables into a single observable emitting an array of deleted statuses
		return combineLatest(deletedObservables).pipe(
			startWith(docs.map((doc) => doc.deleted)),
			distinctUntilChanged(isEqual),
			rxMap((deletedArray) => {
				// Filter lineItems based on the deletedArray
				return docs.filter((_, index) => !deletedArray[index]);
			})
		);
	})
);
```

Also update the import to include `of`:

```typescript
import { combineLatest, of } from 'rxjs';
```

**Step 4: Run tests to verify all pass**

Run: `cd packages/database && npx jest populate.test.ts -v`
Expected: PASS (all existing tests + new test)

**Step 5: Commit**

```bash
git add packages/database/src/plugins/populate.ts packages/database/src/plugins/populate.test.ts
git commit -m "fix: filter null/empty IDs in populate$ to prevent IndexedDB key errors"
```

---

### Task 5: Make sync bulk write errors silent (no toast)

**Files:**
- Modify: `packages/query/src/sync-state.ts`

**Step 1: Change `showToast: true` to `showToast: false` in sync errors**

In `packages/query/src/sync-state.ts`, there are two error logging calls that show toasts:

**Line 313** (inside `_processServerResponseInternal`, bulk insert errors):

Replace:
```typescript
syncLogger.error('Error inserting documents', {
	showToast: true,
	saveToDb: true,
```

With:
```typescript
syncLogger.error('Error inserting documents', {
	showToast: false,
	saveToDb: true,
```

**Line 358** (inside `_processServerResponseInternal`, bulk upsert errors):

Replace:
```typescript
syncLogger.error('Error upserting documents', {
	showToast: true,
	saveToDb: true,
```

With:
```typescript
syncLogger.error('Error upserting documents', {
	showToast: false,
	saveToDb: true,
```

**Step 2: Verify sync state tests still pass**

Run: `cd packages/query && npx jest --config jest.config.cjs sync-state -v`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/query/src/sync-state.ts
git commit -m "fix: suppress sync error toasts — log silently to DB instead"
```

---

### Task 6: Create the RxDB storage error-handling wrapper

**Files:**
- Create: `packages/database/src/plugins/wrapped-error-handler-storage.ts`
- Modify: `packages/database/src/adapters/default/index.web.ts`

**Step 1: Create the storage wrapper**

Create `packages/database/src/plugins/wrapped-error-handler-storage.ts`:

```typescript
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import type { RxStorage, RxStorageInstance, RxStorageInstanceCreationParams } from 'rxdb';

const storageLogger = getLogger(['wcpos', 'db', 'storage']);

/**
 * Classify an error from the RxDB storage layer and log it appropriately.
 * Returns true if the error was handled (callers may provide a fallback value).
 */
function handleStorageError(methodName: string, error: unknown, params?: any): boolean {
	const message = error instanceof Error ? error.message : String(error);

	// CONFLICT errors (409) — typically harmless, retried on next sync cycle
	if (message.includes('CONFLICT') || message.includes('409')) {
		storageLogger.warn(`Write conflict in ${methodName}`, {
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.WRITE_CONFLICT,
				method: methodName,
			},
		});
		return true;
	}

	// Schema validation errors (COL22)
	if (message.includes('COL22') || message.includes('schema')) {
		storageLogger.warn(`Schema validation failed in ${methodName}`, {
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.SCHEMA_VALIDATION_FAILED,
				method: methodName,
			},
		});
		return true;
	}

	// IndexedDB key errors (null ID)
	if (message.includes('No key or key range specified') || message.includes('No valid key')) {
		storageLogger.warn(`Invalid key in ${methodName}`, {
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.STORAGE_ERROR,
				method: methodName,
			},
		});
		return true;
	}

	// Worker communication failures
	if (message.includes('could not requestRemote')) {
		storageLogger.error(`Storage worker error in ${methodName}`, {
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.WORKER_CONNECTION_LOST,
				method: methodName,
			},
		});
		// Don't suppress — this is critical
		return false;
	}

	// Unknown errors — log but don't suppress
	storageLogger.error(`Storage error in ${methodName}: ${message}`, {
		saveToDb: true,
		context: {
			errorCode: ERROR_CODES.STORAGE_ERROR,
			method: methodName,
		},
	});
	return false;
}

/**
 * Wraps an RxStorageInstance to catch errors, log them through the logger,
 * and provide graceful fallbacks where safe to do so.
 */
function wrapStorageInstance<RxDocType>(
	instance: RxStorageInstance<RxDocType, any, any, any>
): RxStorageInstance<RxDocType, any, any, any> {
	const originalFindDocumentsById = instance.findDocumentsById.bind(instance);
	const originalBulkWrite = instance.bulkWrite.bind(instance);

	instance.findDocumentsById = async (ids, withDeleted) => {
		try {
			return await originalFindDocumentsById(ids, withDeleted);
		} catch (error) {
			const handled = handleStorageError('findDocumentsById', error);
			if (handled) {
				// Return empty results as graceful fallback
				return [] as any;
			}
			throw error;
		}
	};

	instance.bulkWrite = async (documentWrites, context) => {
		try {
			return await originalBulkWrite(documentWrites, context);
		} catch (error) {
			const handled = handleStorageError('bulkWrite', error);
			if (handled) {
				// Return all writes as errors — the caller can handle partial results
				return {
					success: [],
					error: documentWrites.map((write) => ({
						status: 409,
						isError: true,
						documentId: (write.document as any)[instance.schema.primaryKey],
						writeRow: write,
						documentInDb: write.previous || (write.document as any),
					})),
				} as any;
			}
			throw error;
		}
	};

	return instance;
}

/**
 * Wraps an RxStorage to add error handling to all storage instances it creates.
 */
export function wrappedErrorHandlerStorage<Internals, InstanceCreationOptions>({
	storage,
}: {
	storage: RxStorage<Internals, InstanceCreationOptions>;
}): RxStorage<Internals, InstanceCreationOptions> {
	return {
		name: 'error-handler-' + storage.name,
		rxpiCompatibilityVersion: storage.rxpiCompatibilityVersion,
		async createStorageInstance<RxDocType>(
			params: RxStorageInstanceCreationParams<RxDocType, InstanceCreationOptions>
		) {
			const instance = await storage.createStorageInstance(params);
			return wrapStorageInstance(instance);
		},
	};
}
```

**Step 2: Wire it into the web storage adapter**

In `packages/database/src/adapters/default/index.web.ts`, add the wrapper:

Replace the entire file:

```typescript
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';

import { wrappedErrorHandlerStorage } from '../../plugins/wrapped-error-handler-storage';

const workerStorage = getRxStorageWorker({
	workerInput: (globalThis as Record<string, any>).idbWorker,
});

// Always wrap with error handler (catches/logs raw RxDB errors before they reach UI)
export const storage = wrappedErrorHandlerStorage({ storage: workerStorage });

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	ignoreDuplicate: !!__DEV__,
};
```

**Step 3: Verify the database package builds**

Run: `cd packages/database && pnpm tsc --noEmit`
Expected: No type errors

**Step 4: Run database tests**

Run: `cd packages/database && npx jest -v`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/plugins/wrapped-error-handler-storage.ts packages/database/src/adapters/default/index.web.ts
git commit -m "feat: add storage-level error handler wrapper for graceful RxDB error handling"
```

---

### Task 7: Add error badge to Logs drawer item

**Files:**
- Create: `packages/core/src/screens/main/components/drawer-content/logs-badge.tsx`
- Modify: `apps/main/app/(app)/(drawer)/_layout.tsx`

**Step 1: Create the LogsBadge component**

Create `packages/core/src/screens/main/components/drawer-content/logs-badge.tsx`:

```typescript
import React from 'react';
import { View } from 'react-native';

import { Badge } from '@wcpos/components/badge';
import { useLocalQuery } from '@wcpos/query';
import { useObservableState } from 'observable-hooks';

/**
 * Tracks the count of error-level logs since the last time the user viewed the Logs screen.
 * Uses a timestamp stored in state — when the user navigates to Logs, the timestamp resets.
 */
export function useUnreadErrorCount() {
	const [lastViewedTimestamp, setLastViewedTimestamp] = React.useState(() => Date.now());

	const query = useLocalQuery({
		queryKeys: ['logs-badge', lastViewedTimestamp],
		collectionName: 'logs',
		initialParams: {
			selector: {
				level: { $eq: 'error' },
				timestamp: { $gt: lastViewedTimestamp },
			},
		},
	});

	const count = useObservableState(query.count$, 0);

	const markAsRead = React.useCallback(() => {
		setLastViewedTimestamp(Date.now());
	}, []);

	return { count, markAsRead };
}

/**
 * Small badge that shows the count of unread error logs.
 * Renders nothing when count is 0.
 */
export function LogsBadge({ count }: { count: number }) {
	if (count === 0) return null;

	return (
		<View className="absolute -top-1 -right-0.5">
			<Badge count={count} max={99} variant="destructive" size="sm" />
		</View>
	);
}
```

**Step 2: Integrate the badge into the drawer layout**

In `apps/main/app/(app)/(drawer)/_layout.tsx`, find the Logs `Drawer.Screen` entry (around line 133). The `drawerIcon` callback needs to include the badge. This requires:

1. Import the `LogsBadge` and `useUnreadErrorCount` at the top of the file
2. Call the hook in the component body
3. Wrap the icon with the badge

Add imports:
```typescript
import { LogsBadge, useUnreadErrorCount } from '@wcpos/core/screens/main/components/drawer-content/logs-badge';
```

Call the hook in the component body (before the JSX return):
```typescript
const { count: unreadErrorCount, markAsRead: markLogsAsRead } = useUnreadErrorCount();
```

Update the Logs `Drawer.Screen` icon:
```tsx
drawerIcon: ({ focused }) => (
	<View>
		<Icon
			size="xl"
			name="heartPulse"
			className={focused ? 'text-primary' : 'text-sidebar-foreground'}
		/>
		<LogsBadge count={unreadErrorCount} />
	</View>
),
```

Also add a listener to reset the badge when navigating to the Logs screen. You can use the `listeners` prop on the Drawer.Screen:

```tsx
<Drawer.Screen
	name="logs"
	listeners={{
		focus: () => markLogsAsRead(),
	}}
	options={{
		// ... existing options
	}}
/>
```

**Note:** The exact integration depends on how the drawer layout file is structured. The implementer should read the file first and find the right insertion point. The key pieces are: import the components, call the hook, wrap the icon, and add the focus listener.

**Step 3: Verify the app builds**

Run: `cd apps/main && npx expo export --platform web --no-minify 2>&1 | head -20`
Expected: No import or type errors

**Step 4: Commit**

```bash
git add packages/core/src/screens/main/components/drawer-content/logs-badge.tsx apps/main/app/\(app\)/\(drawer\)/_layout.tsx
git commit -m "feat: add error count badge to Logs drawer item"
```

---

### Task 8: Lint and final verification

**Step 1: Run lint from repo root**

Run: `pnpm run lint`
Expected: PASS (no new lint errors)

**Step 2: Run all tests**

Run: `pnpm run test`
Expected: PASS

**Step 3: Final commit if any lint fixes were needed**

```bash
git add -A
git commit -m "chore: lint fixes"
```
