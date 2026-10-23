import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import { firstValueFrom } from 'rxjs';

import type { StoreDatabase } from '@wcpos/database';

import {
	CLAIM_LEASE_MS,
	claimHeld,
	claimRoute,
	markSent,
	type MoneyCommandEntry,
	nextClaimExpiry,
	observeMoneyJournal,
	observeOrderCommands,
	readOrderCommands,
	releaseClaim,
} from '../../src/store-local';
import {
	CHAIN_RETENTION_MS,
	deferEntry,
	dropUnsent,
	readMoneyJournal,
	retireChain,
	retireRoute,
	settleCommand,
} from '../../src/store-local/money-commands';

import type { RxDatabase } from 'rxdb';

// Dev mode allows a second handle on one database name: two tabs on one store database.
addRxPlugin(RxDBDevModePlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);

let name: string;
let handles: RxDatabase[];
const open = async () => {
	const db = await createRxDatabase({
		name,
		storage: wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }),
		localDocuments: true,
		multiInstance: true,
		ignoreDuplicate: true,
	});
	handles.push(db);
	return db as unknown as StoreDatabase;
};
beforeEach(() => {
	name = `claims${Math.random().toString(36).slice(2)}`;
	handles = [];
});
afterEach(async () => {
	for (const db of handles.reverse()) await db.close();
});

const route = { orderUuid: 'order', kind: 'close', target: null, rowId: null } as const;
const candidate = (id: string): MoneyCommandEntry => ({
	orderUuid: 'order',
	kind: 'close',
	path: 'orders/5/close',
	target: null,
	id,
	body: {},
	approval: { total: '0.00', currency: 'USD' },
	sentAt: null,
	sentRevision: null,
	scope: 'test-scope',
});

// ADR 0040 §1.3: get-or-create and claim happen in ONE write of the shared journal, which the
// store database serialises across every handle on it, so two tabs never mint two commands.
it('two tabs claiming one route at once through two handles create one command; the other is busy', async () => {
	const [tabA, tabB] = [await open(), await open()];
	const claims = await Promise.all([
		claimRoute(tabA, route, 'tab-a', candidate('command-a')),
		claimRoute(tabB, route, 'tab-b', candidate('command-b')),
	]);
	expect(claims.map(({ status }) => status).sort()).toEqual(['busy', 'created']);
	const { entries } = await readOrderCommands(tabA, 'order');
	expect(entries).toHaveLength(1);
	const busy = claims.find(({ status }) => status === 'busy') as { entry: MoneyCommandEntry };
	expect(busy.entry.id).toBe(entries[0].id);
});

it('a lapsed claim frees the route for another tab, and a released claim keeps the entry', async () => {
	const [tabA, tabB] = [await open(), await open()];
	const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
	try {
		await claimRoute(tabA, route, 'tab-a', candidate('command-a'));
		// Still claimed: the other tab is busy, whatever it proposes.
		expect(await claimRoute(tabB, route, 'tab-b', candidate('command-b'))).toMatchObject({
			status: 'busy',
		});
		// The claim lapses with its lease: a crashed tab's unsent command put nothing on the
		// server, so the other tab's command takes its slot (one command, never two).
		now.mockReturnValue(1_000_000 + CLAIM_LEASE_MS);
		const lapsed = await claimRoute(tabB, route, 'tab-b', candidate('command-b'));
		expect(lapsed).toMatchObject({ status: 'created', entry: { claimedBy: 'tab-b' } });
		await releaseClaim(tabB, 'order', 'command-b', 'tab-b');
		expect((await readOrderCommands(tabA, 'order')).entries).toEqual([
			expect.objectContaining({ id: 'command-b', claimedBy: null }),
		]);
	} finally {
		now.mockRestore();
	}
});

// A claim stamped in the future (the clock stepped back after it was written) is not live: it
// would otherwise hold its command for the whole step, and the lapse timer would wait for it.
it('a claim stamped in the future is expired, and schedules no lapse', async () => {
	const tab = await open();
	const now = jest.spyOn(Date, 'now').mockReturnValue(5_000_000);
	try {
		await claimRoute(tab, route, 'tab-a', candidate('command-a'));
		await markSent(tab, 'order', 'command-a', 'sha256:r1', 'tab-a');
		now.mockReturnValue(1_000_000); // the clock stepped back
		const [entry] = (await readOrderCommands(tab, 'order')).entries;
		expect(claimHeld(entry, null)).toBe(false);
		expect(await nextClaimExpiry(tab, 'test-scope')).toBeNull();
		expect(await claimRoute(tab, route, 'tab-b', null)).toMatchObject({ status: 'open' });
	} finally {
		now.mockRestore();
	}
});

it('a send is fenced on its claimant, and renews the claim', async () => {
	const tab = await open();
	const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
	try {
		await claimRoute(tab, route, 'tab-a', candidate('command-a'));
		// Another poster may not send a command it does not hold, nor may an unclaimed sender.
		expect(await markSent(tab, 'order', 'command-a', 'sha256:r1', 'tab-b')).toBe(false);
		expect(await markSent(tab, 'order', 'command-a', 'sha256:r1', null)).toBe(false);
		expect(await markSent(tab, 'order', 'missing', 'sha256:r1', 'tab-a')).toBe(false);
		now.mockReturnValue(1_010_000);
		expect(await markSent(tab, 'order', 'command-a', 'sha256:r1', 'tab-a')).toBe(true);
		const [entry] = (await readOrderCommands(tab, 'order')).entries;
		expect(entry).toMatchObject({ sentRevision: 'sha256:r1', claimedAt: 1_010_000 });
		expect(entry.sentAt).not.toBeNull();
		// A sent command is re-opened, never replaced by a new candidate.
		now.mockReturnValue(1_010_000 + CLAIM_LEASE_MS);
		expect(await claimRoute(tab, route, 'tab-b', candidate('command-b'))).toMatchObject({
			status: 'open',
			entry: { id: 'command-a', claimedBy: 'tab-b' },
		});
	} finally {
		now.mockRestore();
	}
});

it('a settle deletes only a held entry and keeps the answer chain after its entries', async () => {
	const tab = await open();
	await claimRoute(tab, route, 'tab-a', candidate('command-a'));
	const chain = { answerRevision: 'sha256:r2', answeredAt: Date.now() };
	await settleCommand(tab, 'order', 'command-a', chain, 'tab-b');
	expect((await readOrderCommands(tab, 'order')).entries).toHaveLength(1);
	await settleCommand(tab, 'order', 'command-a', chain, 'tab-a');
	expect(await readOrderCommands(tab, 'order')).toEqual({ entries: [], chain });
	// A released entry is settled by an unclaimed (null) settler.
	await claimRoute(tab, route, 'tab-a', candidate('command-c'));
	await releaseClaim(tab, 'order', 'command-c', 'tab-a');
	await settleCommand(tab, 'order', 'command-c', undefined, null);
	expect((await readOrderCommands(tab, 'order')).entries).toEqual([]);
});

it('a chain is retired only by the answer that wrote it, and lapses after its retention', async () => {
	const tab = await open();
	const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
	try {
		await settleCommand(tab, 'order', null, { answerRevision: 'r1', answeredAt: 1_000_000 });
		await retireChain(tab, 'order', 999_999);
		expect((await readOrderCommands(tab, 'order')).chain).toMatchObject({ answerRevision: 'r1' });
		await retireChain(tab, 'order', 1_000_000);
		expect(await readMoneyJournal(tab)).toEqual({});

		await settleCommand(tab, 'order', null, { answerRevision: 'r2', answeredAt: 1_000_000 });
		now.mockReturnValue(1_000_001 + CHAIN_RETENTION_MS);
		// Any journal write prunes a lapsed chain, and the order with it once nothing is open.
		await settleCommand(tab, 'other', null);
		expect(await readMoneyJournal(tab)).toEqual({});
	} finally {
		now.mockRestore();
	}
});

it('an unsent entry is dropped unless a live claim holds it; a sent one stays', async () => {
	const tab = await open();
	await claimRoute(tab, route, 'tab-a', candidate('command-a'));
	await dropUnsent(tab, 'order', 'command-a', 'tab-b');
	expect((await readOrderCommands(tab, 'order')).entries).toHaveLength(1);
	await dropUnsent(tab, 'order', 'command-a', 'tab-a');
	expect((await readOrderCommands(tab, 'order')).entries).toEqual([]);

	await claimRoute(tab, route, 'tab-a', candidate('command-b'));
	await markSent(tab, 'order', 'command-b', 'sha256:r1', 'tab-a');
	await dropUnsent(tab, 'order', 'command-b', 'tab-a');
	expect((await readOrderCommands(tab, 'order')).entries).toHaveLength(1);
});

it('retiring a route deletes its command, sent or not, and nothing else', async () => {
	const tab = await open();
	const voidRoute = { orderUuid: 'order', kind: 'void', target: 'payment-1', rowId: null } as const;
	await claimRoute(tab, route, 'tab-a', candidate('command-a'));
	await claimRoute(tab, voidRoute, 'tab-a', {
		...candidate('command-v'),
		kind: 'void',
		target: 'payment-1',
	});
	await markSent(tab, 'order', 'command-v', 'sha256:r1', 'tab-a');
	await retireRoute(tab, 'order', 'void', 'payment-1');
	expect((await readOrderCommands(tab, 'order')).entries).toEqual([
		expect.objectContaining({ id: 'command-a' }),
	]);
});

it('the live reads follow the journal', async () => {
	const tab = await open();
	await claimRoute(tab, route, 'tab-a', candidate('command-a'));
	expect(await firstValueFrom(observeMoneyJournal(tab))).toEqual([
		expect.objectContaining({ id: 'command-a' }),
	]);
	expect(await firstValueFrom(observeOrderCommands(tab, 'order'))).toHaveLength(1);
	expect(await firstValueFrom(observeOrderCommands(tab, 'elsewhere'))).toEqual([]);
});

// ADR 0040 Decided 1 rule 3: an offline record is journaled, never dispatched.
it('deferEntry marks sent with no revision and releases the claim; nextClaimExpiry/observe treat it as unanswered', async () => {
	const tab = await open();
	await claimRoute(tab, route, 'tab-a', candidate('command-a'));
	expect(await deferEntry(tab, 'order', 'command-a', 'tab-b')).toBeNull();
	const deferred = await deferEntry(tab, 'order', 'command-a', 'tab-a');
	expect(deferred).toMatchObject({ sentRevision: null, claimedBy: null, claimedAt: null });
	expect(deferred?.sentAt).toEqual(expect.any(String));
	// Unclaimed and sent: no lapse to wait for, re-sendable now, never dropped as a crash leftover.
	expect(await nextClaimExpiry(tab, 'test-scope')).toBeNull();
	await dropUnsent(tab, 'order', 'command-a', null);
	expect(await firstValueFrom(observeOrderCommands(tab, 'order'))).toEqual([
		expect.objectContaining({ id: 'command-a', sentAt: deferred?.sentAt, sentRevision: null }),
	]);
	expect(await claimRoute(tab, route, 'tab-b', null)).toMatchObject({ status: 'open' });
});
