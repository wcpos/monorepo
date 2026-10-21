import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import type { StoreDatabase } from '@wcpos/database';

import {
	CLAIM_LEASE_MS,
	claimRoute,
	type MoneyCommandEntry,
	readOrderCommands,
	releaseClaim,
} from '../../src/store-local';

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
