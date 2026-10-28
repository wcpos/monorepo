# Cashier/register map · slice 1 (device-side register state) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the device remembers, beside its register pointer, which register it is bound to per store, whether that register's session is open and who opened it, and whether this device started the count, so that a hand-over offline never opens a second session and the later slices can read these facts.

**Architecture:** all state lives in the one `register` local document in `userDB` (`packages/query/src/register-session/register-document.ts`), written by the binding sync (the registers list already carries each register's live session), by the session hook's actions, and by the refresh cycle; read by the cycle to seed a session row into a store database that has none, and by the register panel to say when figures are still unknown.

**Tech Stack:** TypeScript, RxDB local documents (`userDB.getLocal('register')`), React hooks, Jest (`packages/query/tests/register-session`, `packages/core/src/services/**`, `packages/core/src/screens/main/pos/cart`).

**Spec:** `packages/core/specs/2026-10-28-cashier-register-map-design.md` § 4.5 (who is counting), § 4.6 (which register in Y), § 5.1.

## Global Constraints

- Lane `next`; this slice is one PR, ≤ 200 added production lines (tests, strings, docs excluded).
- Jest runs with `--maxWorkers=2`; `packages/core` and `packages/query` suites need `NODE_OPTIONS=--max-old-space-size=4096`. Run one suite at a time. `pnpm install` has run in this worktree.
- No new env vars. Constants in code with a comment saying why.
- Every user-facing string goes through `t()` with a key in `packages/core/src/contexts/translations/locales/en/core.json`.
- Legacy register documents (one pointer per site, `register_id` / `register_name` / `register_store_id`) keep working unchanged; the new fields are additive.
- The seeded row is a placeholder the next refresh replaces: `sync_status: 'synced'`, `server_status: 'open'`, `pending_status: null`, `expected_float: null`, `counted_float: null`. It is never pushed.
- Existing behaviour lines in `packages/core/src/screens/main/pos/cart/LEDGER.md` and `packages/query/src/register-session` ledgers that this slice changes get a line each (lines 52 and 68 of the cart ledger mention the Open register card and the store switch).

## Review Focus

Inputs the spec implies but no task's tests would otherwise exercise; each line's test is added to the task named.

1. A store database that already holds a *closed* row for the cached session id (the cashier closed it on another store and came back): the seed must not resurrect it. → Task 3.
2. A cached session for register A while the device is now bound to register B of the same store (rebound while offline is impossible, but the pointer and the cache can disagree after a store switch): the seed reads the cache of the *bound* register only. → Task 3.
3. The registers list arrives with `session: null` for the bound register after a close elsewhere: the cache is cleared, and `counting_here` with it. → Task 2.
4. A reload mid-count on this device: the cache says `counting` with `counting_here: true`, and the cart column must reopen the count (today it does, because the session row is local); a reload on *another* device shows Counting elsewhere. This slice only records the mark; the card is slice 5. → Task 4 records; Task 4's test asserts the mark round-trips.
5. The register panel on a seeded row shows `0,00` for every figure, and a close written from it would record a false shortage: a reader would take it as an empty drawer. → Task 5 (the Notice, the disabled intent, the guard in `startCounting`).
6. Cashier A opens the register offline and hands over to B before the opening is uploaded: B must not be told the server has A's session. → Task 3's unacknowledged seed (a pending create under the same id).

---

### Task 1: One register pointer per store

**Files:**
- Modify: `packages/query/src/register-session/register-document.ts` (`RegisterDocument.sites[*]`, `getBoundRegisterId`, `readBoundRegister`, `bindRegister`, `unbindRegister`)
- Test: `packages/query/tests/register-session/register-document.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RegisterDocument.sites[siteUuid].bindings?: Record<string, { register_id: string; register_name: string | null }>` keyed by `String(storeId ?? 0)`; the four functions keep their signatures, plus one sync accessor `export function getBoundRegister(siteUuid: string, storeId?: number): { id: string; name: string } | null` (the same rule as `getBoundRegisterId`, with the name) for callers that hold no database handle. `directory()` in `use-register-binding.ts:63-72` initialises from `getBoundRegister(siteUuid, storeId)` instead of the legacy `register_id` / `register_name` fields, so a store whose binding differs from the last legacy pointer boots bound to its own register. A bind writes `bindings[store]` **and** the legacy trio (`register_id`, `register_name`, `register_store_id`) so older readers still see the last bind; a read prefers `bindings[store]`, then the legacy trio when `register_store_id` matches or is null (today's rule). An unbind removes `bindings[store]` and clears the legacy trio only when they point at that store.

- [ ] **Step 1: Move the existing expectation, then add one test** in `register-document.test.ts`. The existing test `'rejects another store pointer after hydration without resetting the site counter'` (line 136) asserts the old one-pointer-per-site rule (`readBoundRegister(db, 'site', 1)` is null after store 2 binds). That assertion is the behaviour this task changes: rename the test `'keeps each store's pointer after a bind for another store, without resetting the site counter'` and make it expect `{ id: 'a', name: 'A' }` for store 1 after store 2 binds, `getCurrentBoundRegisterId()` following the last read, the counter still at 2, and after `unbindRegister(db, 'site', 2)` store 1 still bound. `'does not unbind a pointer another store of the site has written'` and the legacy-pointer test stay as they are. Then add:

```ts
it('still reads a legacy single pointer for its store and nothing for another', async () => {
	await remintRegister(db);
	const doc = await db.getLocal('register');
	await doc!.incrementalModify((data) => ({
		...data,
		sites: { site: { sale_counter: 0, register_id: 'L', register_name: 'Legacy', register_store_id: 1 } },
	}));
	expect(await readBoundRegister(db, 'site', 1)).toEqual({ id: 'L', name: 'Legacy' });
	expect(await readBoundRegister(db, 'site', 2)).toBeNull();
});
```

- [ ] **Step 2: Run the file to see the two fail**

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm -C /Users/kilbot/Projects/monorepo-v2-worktrees/cashier-register-map/packages/query exec jest tests/register-session/register-document.test.ts --maxWorkers=2`
Expected: the moved expectation and the new test FAIL (store 1's pointer is dropped by store 2's bind); every other test passes.

- [ ] **Step 3: Implement** the `bindings` map and the three read/write rules in `register-document.ts`. `getBoundRegisterId(siteUuid, storeId)`: `site.bindings?.[String(storeId ?? 0)]?.register_id ?? <today's legacy rule>`. Keep `getCurrentBoundRegisterId` unchanged.

- [ ] **Step 4: Run the file again**

Expected: all PASS, including `'rejects another store pointer after hydration…'`, `'does not unbind a pointer another store of the site has written'` and `'re-mints a cloned till…'` (bindings survive a re-mint like the legacy trio does; add `bindings` to the kept fields in `reminted` if that test fails).

- [ ] **Step 4b: Failing test in `use-register-binding.test.tsx`** (after `'uses the pointer offline without fetching'`):

```ts
it('boots a store on its own binding when the last bind was for another store', async () => {
	await bindRegister(mockDB, mockSite, { id: 'a', name: 'Front' }, 1);
	await bindRegister(mockDB, mockSite, { id: 'b', name: 'Back' }, 2);
	mockStoreId = 1;
	mockStatus = 'offline';
	const { result } = mount();
	expect(result.current.registerId).toBe('a'); // synchronously, before any sync
	expect(result.current.registerName).toBe('Front');
});
```

  Then implement `getBoundRegister` and the `directory()` change.

- [ ] **Step 5: Run the binding hook's suite**, which exercises the same functions through the directory:

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm -C /Users/kilbot/Projects/monorepo-v2-worktrees/cashier-register-map/packages/core exec jest src/services/register/use-register-binding.test.tsx --maxWorkers=2`
Expected: PASS. `'rebinds the site pointer when the store changes'` and `'clears a pointer from another store before asking for a choice'` still pass because the legacy trio is still written on every bind.

- [ ] **Step 6: Commit**

```bash
git -C /Users/kilbot/Projects/monorepo-v2-worktrees/cashier-register-map add packages/query/src/register-session/register-document.ts packages/query/tests/register-session/register-document.test.ts
git -C /Users/kilbot/Projects/monorepo-v2-worktrees/cashier-register-map commit -m "feat(register): one register pointer per store of a site"
```

### Task 2: The live-session cache, written by the binding sync

**Files:**
- Modify: `packages/query/src/register-session/register-document.ts`
- Modify: `packages/query/src/register-session/index.ts` (export the three new functions and the type)
- Modify: `packages/core/src/services/register/use-register-binding.ts:89-128` (`loadDirectory`'s success path: it gains `userDB` and `siteUuid` parameters, and writes the cache there, after `publish`, only for the response that is still `entry.request`; `syncBinding` passes them through). Never from `syncBinding`'s reuse of a cached request: a stale list must not overwrite a session the hook recorded since.
- Test: `packages/query/tests/register-session/register-document.test.ts`, `packages/core/src/services/register/use-register-binding.test.tsx`

**Interfaces:**
- Produces, in `register-document.ts`:

```ts
export type LiveSession = {
	session_id: string;
	status: 'open' | 'counting';
	opened_at_gmt: string;
	opened_by: { id: number; name: string } | null;
	/** The server has the session (it came from the registers list, or the local row is synced / carries a server_status). */
	acknowledged: boolean;
	/** The opening floats, for an unacknowledged session only; null when the server owns the row. */
	expected_float: string | null;
	counted_float: string | null;
	/** The row's store-local business day (`YYYY-MM-DD`); null when it came from the registers list, which has none. */
	business_day: string | null;
	/** This device started the count; cleared by back-to-selling and by any status that is not counting. */
	counting_here: boolean;
	/** When the cache was written (ISO). */
	at: string;
};
export async function recordLiveSession(userDB, siteUuid: string, registerId: string, live: Omit<LiveSession, 'counting_here' | 'at'> | null): Promise<void>;
export function readLiveSession(siteUuid: string, registerId: string): LiveSession | null; // from the in-memory snapshot, like getBoundRegisterId
export async function markCountingHere(userDB, siteUuid: string, registerId: string, here: boolean): Promise<void>;
```

  Stored at `sites[siteUuid].registers[registerId].live`. `recordLiveSession(…, null)` deletes `live`. `recordLiveSession` with a new `session_id` or a status other than `counting` resets `counting_here` to `false`; with the same `session_id` and status `counting` it keeps the existing `counting_here`.
- Consumes: `Register.session` as `use-register-binding.ts:19-33` already types it. The registers list is the server's word: a listed session is `acknowledged: true` with null floats; a listed register with `session: null` clears the cache (the only place besides `closeSession` that clears it).

- [ ] **Step 1: Failing tests in `register-document.test.ts`:**

```ts
it("caches a register's live session on the device and clears it", async () => {
	await remintRegister(db);
	const base = { opened_at_gmt: '2026-10-28T13:05:00Z', opened_by: { id: 7, name: 'Demo Cashier' }, acknowledged: true, expected_float: null, counted_float: null, business_day: null };
	await recordLiveSession(db, 'site', 'A', { ...base, session_id: 's1', status: 'open' });
	expect(readLiveSession('site', 'A')).toMatchObject({ session_id: 's1', status: 'open', counting_here: false });
	await markCountingHere(db, 'site', 'A', true);
	await recordLiveSession(db, 'site', 'A', { ...base, session_id: 's1', status: 'counting' });
	expect(readLiveSession('site', 'A')?.counting_here).toBe(true);
	await recordLiveSession(db, 'site', 'A', { ...base, session_id: 's2', status: 'open', opened_by: null });
	expect(readLiveSession('site', 'A')?.counting_here).toBe(false);
	await recordLiveSession(db, 'site', 'A', null);
	expect(readLiveSession('site', 'A')).toBeNull();
});
```

- [ ] **Step 2: Failing test in `use-register-binding.test.tsx`** (after `'silently binds the sole register the store lists and filters by store'`; `rows` is the file's fixture):

```ts
it("records each listed register's live session on the device, and clears a closed one", async () => {
	mockHttp.get.mockResolvedValue({
		data: [
			{ id: 'a', name: 'a', session: { id: 's1', status: 'open', opened_at_gmt: '2026-10-28T13:05:00Z', opened_by: { id: 7, name: 'Demo Cashier' } } },
			{ id: 'b', name: 'b', session: null },
		],
	});
	await recordLiveSession(mockDB, mockSite, 'b', { session_id: 'old', status: 'open', opened_at_gmt: '2026-10-27T09:00:00Z', opened_by: null, acknowledged: true, expected_float: null, counted_float: null, business_day: null });
	const { result } = mount();
	await waitFor(() => expect(result.current.loaded).toBe(true));
	expect(readLiveSession(mockSite, 'a')).toMatchObject({ session_id: 's1', acknowledged: true, opened_by: { name: 'Demo Cashier' } });
	expect(readLiveSession(mockSite, 'b')).toBeNull();
});
```

- [ ] **Step 2b: Failing test in `use-register-binding.test.tsx`:**

```ts
it('a reconnect that reuses the cached list does not erase a session recorded since', async () => {
	mockHttp.get.mockResolvedValue({ data: [{ id: 'a', name: 'a', session: null }] });
	const { result, rerender } = mount();
	await waitFor(() => expect(result.current.loaded).toBe(true));
	await recordLiveSession(mockDB, mockSite, 'a', { session_id: 'local', status: 'open', opened_at_gmt: '2026-10-28T13:05:00Z', opened_by: null, acknowledged: false, expected_float: '100.0000', counted_float: '100.0000', business_day: '2026-10-28' });
	mockStatus = 'offline'; rerender(); mockStatus = 'online-website-available'; rerender(); // reconnect: syncBinding runs, loadDirectory returns the cached request
	await waitFor(() => expect(mockHttp.get).toHaveBeenCalledTimes(1));
	expect(readLiveSession(mockSite, 'a')?.session_id).toBe('local');
});
```

- [ ] **Step 3: Run both files, see the three new tests fail** (functions undefined / cache empty / cache erased).

- [ ] **Step 4: Implement** the three functions in `register-document.ts` (same `incrementalModify` shape as `adoptCounters`; update `currentRegister` after the write), export them from `index.ts`, and in `loadDirectory`'s fresh-response path write `recordLiveSession` for every row in the response (`row.session ? { session_id: row.session.id, status: row.session.status, opened_at_gmt: row.session.opened_at_gmt, opened_by: row.session.opened_by, acknowledged: true, expected_float: null, counted_float: null, business_day: null } : null`), awaited in series before the bind logic.

- [ ] **Step 5: Run both files**: PASS. Run the full `use-register-binding.test.tsx` and `register-document.test.ts`: PASS.

- [ ] **Step 6: Commit** `feat(register): the device caches each register's live session from the registers list`.

### Task 3: Seed the session row

**Files:**
- Create: `packages/query/src/register-session/seed.ts`
- Modify: `packages/query/src/register-session/cycle.ts:71` (before `if (!online) return;`)
- Modify: `packages/query/src/register-session/index.ts` (export `seedSessionFromCache`)
- Test: create `packages/query/tests/register-session/cycle.test.ts` (harness: a memory `userDB` as in `register-document.test.ts`; a store database with the register collections, as `session-store.test.ts` builds one; `http` a `jest.fn()`; `engine` as `queue.test.ts` fakes it)

**Interfaces:**
- Produces: `export async function seedSessionFromCache(storeDB: RegisterStoreDatabase, live: LiveSession, registerId: string, storeId: number | null | undefined): Promise<'seeded' | 'present' | 'closed'>` — `'present'` when any row with `live.session_id` exists and is not closed, `'closed'` when that row's status is `closed`, else inserts and returns `'seeded'`. The inserted row: `id: live.session_id, register_id: registerId, store_id: storeId ?? null, status: live.status, business_day: live.business_day ?? live.opened_at_gmt.slice(0, 10) (the UTC date only for a list-sourced, acknowledged row, which the first refresh replaces), opened_at_gmt: live.opened_at_gmt, opened_by: live.opened_by?.id ?? null, expected_float: live.expected_float, counted_float: live.counted_float, opening_variance: null, status_at: live.at`, and then by `acknowledged`:
  - `true` → `sync_status: 'synced', server_status: live.status, pending_status: null` (a placeholder the next refresh merges over; never pushed);
  - `false` → `sync_status: 'pending', server_status: null, pending_status: live.status` (the queue creates it on the server under the same id; session ids are the server's idempotency keys, so the opener's own later upload is deduplicated, not doubled).
- Consumes: `readLiveSession` (Task 2); `registerCollections` (`store-database.ts`).

- [ ] **Step 1: Failing tests in `cycle.test.ts`:**

```ts
it("offline, seeds the bound register's cached open session into a store database that has no row", async () => {
	// userDB with an acknowledged live session for 'A'; storeDB empty; online: false
	await runRegisterSessionCycle({ storeDB, userDB, siteUuid: 'site', storeId: 1, registerId: 'A', online: false, engine, http });
	const row = await registerCollections(storeDB).register_sessions.findOne('s1').exec();
	expect(row?.toJSON()).toMatchObject({ status: 'open', register_id: 'A', opened_by: 7, sync_status: 'synced', server_status: 'open', counted_float: null, business_day: '2026-10-28' });
	expect(http.get).not.toHaveBeenCalled();
});
it('seeds an opening the server has not acknowledged as a pending create with its floats and its business day', async () => {
	// live: acknowledged false, expected_float '100.0000', counted_float '100.0000', business_day '2026-10-29' (opened 2026-10-28T23:30:00Z in a store east of UTC)
	expect(await seedSessionFromCache(storeDB, live, 'A', 1)).toBe('seeded');
	expect((await sessions.findOne('s1').exec())?.toJSON()).toMatchObject({ sync_status: 'pending', server_status: null, pending_status: 'open', counted_float: '100.0000', business_day: '2026-10-29' });
});
it('does not resurrect a session the store database already holds as closed', async () => {
	// insert s1 as closed first
	expect(await seedSessionFromCache(storeDB, live, 'A', 1)).toBe('closed');
	expect((await sessions.findOne('s1').exec())?.status).toBe('closed');
});
it("seeds only the bound register's cache", async () => {
	// cache for 'A', bound register 'B': nothing inserted
	await runRegisterSessionCycle({ …registerId: 'B', online: false… });
	expect(await sessions.find().exec()).toHaveLength(0);
});
it('leaves an existing open row alone', async () => {
	expect(await seedSessionFromCache(storeDB, live, 'A', 1)).toBe('present');
});
```

- [ ] **Step 2: Run the file, see the five fail** (module missing).

- [ ] **Step 3: Implement** `seed.ts` and the cycle hook: after the reservation stage, `const live = registerId ? readLiveSession(siteUuid, registerId) : null; if (live) await staged('seed', () => seedSessionFromCache(storeDB, live, registerId!, storeId));` — this runs online too, so a device that comes back online with no row seeds first and the refresh merges the server's figures over it. `readLiveSession` reads the in-memory snapshot, which `readRegister(userDB)` at the reservation stage has just refreshed.

- [ ] **Step 4: Run the file: PASS.** Run `queue.test.ts` and `session-store.test.ts`: PASS (unchanged).

- [ ] **Step 5: Commit** `feat(register): seed the cached session into a store database that has none`.

### Task 4: The session hook writes the cache and the counting mark

**Files:**
- Modify: `packages/core/src/services/register-session/use-register-session.ts:296-360` (`actions.openSession`, `startCounting`, `backToSelling`, `closeSession`)
- Modify: `packages/query/src/register-session/cycle.ts` (after the refresh stage)
- Test: `packages/core/src/services/register-session/use-register-session.test.tsx` (its harness: the `settled` helper and the `@wcpos/query/register-session` mock, which spreads `requireActual`; add `jest.fn()` spies for `recordLiveSession` and `markCountingHere` on top of the spread), `packages/query/tests/register-session/cycle.test.ts`

**Interfaces:**
- Consumes: `recordLiveSession`, `markCountingHere`, `readLiveSession` (Task 2).
- Produces: nothing new; side effects on the register document:
  - `openSession` → `recordLiveSession(userDB, site.uuid, registerId, { session_id: row.id, status: 'open', opened_at_gmt: row.opened_at_gmt, opened_by: { id: wpCredentials.id, name: wpCredentials.display_name }, acknowledged: false, expected_float: row.expected_float, counted_float: row.counted_float, business_day: row.business_day })`.
  - `startCounting` → `recordLiveSession(…status: 'counting', acknowledged: <session.sync_status === 'synced' || session.server_status != null>…)` then `markCountingHere(…, true)`.
  - `backToSelling` → `recordLiveSession(…status: 'open'…)` (which resets the mark).
  - `closeSession` (after the closure is written) → `recordLiveSession(…, null)`.
  - the cycle, after `refreshSessions` (and only when `registerId`): look up the register's active row with `sessions.findOne({ selector: { register_id: registerId, status: { $in: ['open', 'counting'] }, sync_status: { $ne: 'failed' } } })`; when found, `recordLiveSession` with the row's `status`, `opened_at_gmt`, `opened_by` (`{ id, name }` where `name` is the cached `opened_by.name` when the id matches, else `''`), `acknowledged: row.sync_status === 'synced' || row.server_status != null`, the row's floats and `business_day`; when none, read `sessions.findOne(live.session_id)`: a row that now reads `closed` is the server's word that the cached session ended (another till closed it), so `recordLiveSession(…, null)`; no row, or any other status, leaves the cache alone (the registers list and `closeSession` also clear it; the seed's `'closed'` rule is the last guard).

- [ ] **Step 1: Failing test in `use-register-session.test.tsx`:**

```ts
it('records the live session and the counting mark on the device as the session moves', async () => {
	const { result } = await settled(/* an open session for register 'A' on site 'site', as the file's other tests build one */);
	await act(() => result.current.actions.startCounting());
	expect(mockRecordLiveSession).toHaveBeenLastCalledWith(expect.anything(), 'site', 'A', expect.objectContaining({ status: 'counting' }));
	expect(mockMarkCountingHere).toHaveBeenLastCalledWith(expect.anything(), 'site', 'A', true);
	await act(() => result.current.actions.backToSelling());
	expect(mockRecordLiveSession).toHaveBeenLastCalledWith(expect.anything(), 'site', 'A', expect.objectContaining({ status: 'open' }));
});
```

- [ ] **Step 2: Failing tests in `cycle.test.ts`:**

```ts
it("online, after the refresh, records the register's active session on the device", async () => {
	// http.get('sessions', …) returns [{ id: 's9', status: 'open', register_id: 'A', opened_at_gmt: …, opened_by: 7 }] then the sessions/s9 detail
	await runRegisterSessionCycle({ …online: true… });
	expect(readLiveSession('site', 'A')).toMatchObject({ session_id: 's9', status: 'open', acknowledged: true });
});
it("a refresh during this device's count keeps the counting mark", async () => {
	// cache: s9 counting, counting_here true; server list returns s9 as counting
	await runRegisterSessionCycle({ …online: true… });
	expect(readLiveSession('site', 'A')).toMatchObject({ status: 'counting', counting_here: true });
});
it('a refresh that brings the cached session back closed clears the cache', async () => {
	// cache: s9 open; server list returns s9 as closed (another till closed it)
	await runRegisterSessionCycle({ …online: true… });
	expect(readLiveSession('site', 'A')).toBeNull();
});
```

- [ ] **Step 3: Run both files, see the four fail.**

- [ ] **Step 4: Implement** the four action writes and the cycle's post-refresh write.

- [ ] **Step 5: Run both files: PASS.** Run the whole `use-register-session.test.tsx`: PASS.

- [ ] **Step 6: Commit** `feat(register): the session hook and the cycle keep the device's live-session cache current`.

### Task 5: Unknown figures never reach a count or a closure

**Files:**
- Modify: `packages/core/src/services/register-session/use-register-session.ts` (the returned object and `actions.startCounting`)
- Modify: `packages/core/src/screens/main/pos/cart/register-panel.tsx` (above the ledger rows, where the refused-movement `Notice` renders at ~line 262; the footer's intent)
- Modify: `packages/core/src/contexts/translations/locales/en/core.json` (`register.figures_after_sync`: `Figures arrive with the next sync.`)
- Test: `packages/core/src/services/register-session/use-register-session.test.tsx`, `packages/core/src/screens/main/pos/cart/register-panel.test.tsx`

**Interfaces:**
- Produces: `useRegisterSession()` returns `figuresPending: boolean` = `!!session && session.sync_status === 'synced' && session.counted_float == null && session.server_expected_at == null` (an acknowledged seed before its first refresh; an unacknowledged seed carries its floats and is never pending). `actions.startCounting` throws `new Error('register.figures_after_sync')` while pending, so no count and no closure can be written from unknown figures. The panel: a `Notice` with `testID="register-panel-figures-pending"`, tone info, shown while pending; the Float step/row shows `—` instead of `0,00`; the footer intent is `disabled: !session || figuresPending`.
- Consumes: `session` from the mocked `useRegisterSession` in the panel test (test line 41-44: `currentSession`; add `figuresPending` to that mock's return).

- [ ] **Step 1: Failing tests:**

```ts
// use-register-session.test.tsx
it("refuses to start counting while a seeded session's figures are pending", async () => {
	const { result } = await settled(/* an open row with counted_float null, server_expected_at null, sync_status 'synced' */);
	expect(result.current.figuresPending).toBe(true);
	await expect(result.current.actions.startCounting()).rejects.toThrow('register.figures_after_sync');
});
// register-panel.test.tsx
it('says the figures are still to come on a seeded session and will not close the register', () => {
	currentSession = { ...openSession, counted_float: null, expected_float: null, server_expected_at: null, sync_status: 'synced' };
	currentFiguresPending = true;
	render(<RegisterPanel open onOpenChange={() => {}} />);
	expect(screen.getByTestId('register-panel-figures-pending')).toBeTruthy();
	expect(screen.queryByText('0,00 £')).toBeNull();
	expect(screen.getByTestId('register-panel-close-register')).toBeDisabled();
});
```

- [ ] **Step 2: Run both files, see the two fail.** Panel: `NODE_OPTIONS=--max-old-space-size=6144 pnpm exec jest --maxWorkers=2 --coverage=false src/screens/main/pos/cart/register-panel.test.tsx` from `packages/core`.

- [ ] **Step 3: Implement** `figuresPending` next to `blind`, the guard in `startCounting`, the `Notice`, `—` for the float amount and the disabled intent.

- [ ] **Step 4: Run both files: PASS.**

- [ ] **Step 5: Commit** `feat(register): a seeded session's unknown figures never reach a count or a closure`.

### Task 6: Ledgers, the repro note and the PR

**Files:**
- Modify: `packages/core/src/screens/main/pos/cart/LEDGER.md` (one line: the Open register card never renders for a register whose cached session is open; evidence Task 3's test), `packages/query/src/register-session/LEDGER.md` if present (one line per new function).

- [ ] **Step 1: Lint and types** for the two packages: `pnpm -C /Users/kilbot/Projects/monorepo-v2-worktrees/cashier-register-map exec turbo run lint typecheck --filter=@wcpos/query --filter=@wcpos/core` (or the repo's equivalent scripts). Expected: clean.

- [ ] **Step 2: Count added production lines**: `git -C … diff --stat origin/next -- ':!*.test.*' ':!*.json' ':!*.md'`. Expected: ≤ 200 added.

- [ ] **Step 3: Live repro on dev-next** (manual, recorded in the PR body, not an E2E): sign in as cashier A, open the register, go offline (devtools), hand over to the saved cashier B through today's Switch user row. Before this slice: the Open register card. After: the cart with the figures-pending Notice on the panel. Record which it was, with the build.

- [ ] **Step 4: Commit the ledger lines, push, open the PR to `next`** with the body: what the slice adds, the repro outcome, the test commands run and their counts, `Spec: packages/core/specs/2026-10-28-cashier-register-map-design.md § 5.1`.

---

## Self-review

- **Spec coverage (§ 5.1):** the repro (Task 6), per-store pointer (Task 1), the cached session id, opener and opened-at (Task 2), the counting mark (Tasks 2 and 4), the Open register card not offering to open a register the cache says is open (Task 3 makes the row exist, so the card's own condition `!session` handles it: no card change), figures unknown until the refresh and never written into a closure (Task 5). Covered.
- **Review of 2026-10-28 (Codex bot on #3028, three threads) folded in:** the post-refresh cache write looks up open *and* counting rows and never clears (Task 4); unknown figures cannot reach a count or closure (Task 5); an unacknowledged opening is cached with its floats and seeded as a pending create under the same id (Tasks 2–4). Second round (two threads): the cache clears when the refresh brings the cached session back closed (Task 4); the store-local business day travels in the cache and the seed (Tasks 2–4). Third round (two threads): the directory bootstrap reads the per-store binding through `getBoundRegister` (Task 1); the registers-list cache write happens only on a fresh response, never on a reused request (Task 2).
- **Types:** `LiveSession` is defined once (Task 2) and consumed in Tasks 3 and 4 by that name; `seedSessionFromCache` returns the three literals Tasks 3 asserts.
- **Review focus:** 1 and 2 in Task 3's tests, 3 in Task 2's binding test, 4 in Task 4's hook test, 5 in Task 5.
- **Proportion:** the plan's code is tests and signatures; the function bodies are left to the implementer.
