import { waitFor } from '@testing-library/react';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import { BehaviorSubject, type Subscription, switchMap } from 'rxjs';

import '@wcpos/database/plugins';
import { userCollections } from '@wcpos/database/collections';

import {
	observeCredentialStores,
	observeSiteCredentials,
	observeUserSites,
	PENDING_USER_DB_READ,
} from '../../src/user-db';

jest.mock('uuid', () => ({ v4: () => `uuid-${Math.random().toString(36).slice(2)}` }));
let db: RxDatabase<import('@wcpos/database').UserDatabase['collections']>;
let subscription: Subscription;
beforeEach(async () => {
	db = await createRxDatabase({
		name: `auth_reads_${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }),
		ignoreDuplicate: true,
	});
	await db.addCollections(userCollections);
});
afterEach(async () => {
	subscription?.unsubscribe();
	await db.close();
});

it('keeps user site order and document identity, including after a link change', async () => {
	const a = await db.sites.insert({ uuid: 'a' });
	const b = await db.sites.insert({ uuid: 'b' });
	const user = await db.users.insert({ uuid: 'user', sites: ['b', 'a'] });
	const values: unknown[] = [];
	subscription = observeUserSites(user).subscribe((value) => values.push(value));
	expect(values).toEqual([PENDING_USER_DB_READ]);
	await waitFor(() =>
		expect((values.at(-1) as { uuid: string }[]).map((row) => row.uuid)).toEqual(['b', 'a'])
	);
	expect((values.at(-1) as unknown[])[0]).toBe(b);
	await user.incrementalPatch({ sites: ['a'] });
	await waitFor(() => expect(values.at(-1)).toHaveLength(1));
	expect((values.at(-1) as unknown[])[0]).toBe(a);
	expect(values.filter((value) => value === PENDING_USER_DB_READ)).toHaveLength(1);
});

it('resolves credentials without wrapping them and follows removal', async () => {
	const credential = await db.wp_credentials.insert({ uuid: 'cashier' });
	const site = await db.sites.insert({ uuid: 'site', wp_credentials: ['cashier'] });
	const values: unknown[] = [];
	subscription = observeSiteCredentials(site).subscribe((value) => values.push(value));
	expect(values).toEqual([PENDING_USER_DB_READ]);
	await waitFor(() => expect(values.at(-1)).toHaveLength(1));
	expect((values.at(-1) as unknown[])[0]).toBe(credential);
	await credential.remove();
	await waitFor(() => expect(values.at(-1)).toEqual([]));
	expect(values.filter((value) => value === PENDING_USER_DB_READ)).toHaveLength(1);
});

it('re-emits pending on every source binding, then resolves genuinely empty lists', async () => {
	const user = await db.users.insert({ uuid: 'user' });
	const site = await db.sites.insert({ uuid: 'site' });
	for (const read$ of [observeUserSites(user), observeSiteCredentials(site)]) {
		const binding$ = new BehaviorSubject(read$);
		const values: unknown[] = [];
		subscription = binding$
			.pipe(switchMap((read) => read))
			.subscribe((value) => values.push(value));
		await waitFor(() => expect(values).toEqual([PENDING_USER_DB_READ, []]));
		binding$.next(read$);
		expect(values[2]).toBe(PENDING_USER_DB_READ);
		await waitFor(() =>
			expect(values).toEqual([PENDING_USER_DB_READ, [], PENDING_USER_DB_READ, []])
		);
		subscription.unsubscribe();
	}
});

it('observes late store inserts and clears the previous credentials on switch', async () => {
	const a = await db.wp_credentials.insert({ uuid: 'a', stores: ['late'] });
	const b = await db.wp_credentials.insert({ uuid: 'b', stores: ['other'] });
	const binding$ = new BehaviorSubject(a);
	const values: unknown[] = [];
	subscription = binding$
		.pipe(switchMap(observeCredentialStores))
		.subscribe((value) => values.push(value));
	expect(values.slice(0, 2)).toEqual([PENDING_USER_DB_READ, []]);
	// Wait for the real empty query answer before inserting, not only the reset [].
	await waitFor(() => expect(values).toEqual([PENDING_USER_DB_READ, [], []]));
	const store = await db.stores.insert({ localID: 'late', id: 1, name: 'Late store' });
	await waitFor(() => expect(values.at(-1)).toHaveLength(1));
	expect((values.at(-1) as unknown[])[0]).toBe(store);
	expect(values.filter((value) => value === PENDING_USER_DB_READ)).toHaveLength(1);
	const switchIndex = values.length;
	binding$.next(b);
	expect(values.slice(switchIndex, switchIndex + 2)).toEqual([PENDING_USER_DB_READ, []]);
	await store.incrementalPatch({ name: 'Superseded' });
	const other = await db.stores.insert({ localID: 'other', id: 2 });
	await waitFor(() => expect(values.at(-1)).toHaveLength(1));
	expect((values.at(-1) as unknown[])[0]).toBe(other);
	expect(
		values
			.slice(switchIndex + 2)
			.every(
				(value) =>
					value !== PENDING_USER_DB_READ &&
					(value as { localID: string }[]).every((row) => row.localID !== 'late')
			)
	).toBe(true);
});
