/**
 * PROBE — not a product test.
 *
 * Stage I1 (ADR 0028, #1385) replaced the temporary orders schema with the minimal
 * engine shape (`{ uuid pk, payload }`). Every other stage-I1 test exercises that shape
 * against a FAKED temporary database; nothing proved the schema is one real RxDB
 * storage will actually construct. This probe boots the REAL `createTemporaryDB` —
 * unmocked rxdb, the production memory storage, and (because `__DEV__` is true here,
 * as in dev builds) the z-schema validating wrapper plus the dev-mode plugin — and
 * walks the template lifecycle the cart depends on: insert with generated uuid,
 * payload round-trip, `.isNew` instance marker, incremental payload merge, remove.
 *
 * If this fails after an RxDB upgrade, the temp-order schema or the create-db boot
 * path is what broke — not the cart consumers.
 */
import { addRxPlugin } from 'rxdb';
import { disableWarnings, RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';

import { createTemporaryDB } from './create-db';
import { RxDBGenerateIdPlugin } from './plugins/generate-id';

// The real logger's import chain drags untransformed expo ESM into node jest; the
// logger is not what this probe is about. Kept observable so boot errors surface.
const mockLoggerError = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ error: (...args: unknown[]) => mockLoggerError(...args) }),
}));

// The uuid package ships ESM-only, which node jest cannot parse (same mock as
// generate-id.test.ts); node's crypto.randomUUID keeps real v4 semantics.
jest.mock('uuid', () => ({
	v4: () => globalThis.crypto.randomUUID(),
}));

// create-db also imports the default (OPFS/expo) adapter for the user/store DBs; that
// chain cannot parse in node jest and is not under probe. The EPHEMERAL adapter — the
// one createTemporaryDB actually uses — stays real.
jest.mock('./adapters/default', () => ({
	defaultConfig: { storage: { name: 'unused-by-this-probe' } },
}));

// Mirror the app's dev boot: dev-mode checks on, generate-id filling uuid primaries.
disableWarnings();
addRxPlugin(RxDBDevModePlugin);
addRxPlugin(RxDBGenerateIdPlugin);

describe('createTemporaryDB against real RxDB storage (ADR 0028 stage I1 schema)', () => {
	it('boots, inserts the engine-shaped template, patches its payload, and removes it', async () => {
		const db = await createTemporaryDB();
		// create-db swallows boot errors into the logger and returns undefined — a
		// missing db here means real RxDB REJECTED the new schema.
		expect(mockLoggerError.mock.calls).toEqual([]);
		expect(db).toBeDefined();

		const inserted = await db!.orders.insert({
			payload: {
				status: 'pos-open',
				created_via: 'woocommerce-pos',
				billing: {},
				shipping: {},
				line_items: [],
			},
		} as never);

		// generate-id fills the uuid primary key when the insert omits it
		expect(inserted.uuid).toEqual(
			expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
		);
		// create-db's postCreate hook pins the isNew marker onto every temp doc instance
		expect((inserted as unknown as { isNew?: boolean }).isNew).toBe(true);
		// the wire-shaped order body round-trips under `payload`
		expect(inserted.payload).toMatchObject({ status: 'pos-open', line_items: [] });

		await inserted.incrementalModify((old) => ({
			...old,
			payload: { ...old.payload, customer_id: 9 },
		}));
		const latest = inserted.getLatest();
		expect(latest.payload).toMatchObject({ status: 'pos-open', customer_id: 9 });
		expect((latest as unknown as { isNew?: boolean }).isNew).toBe(true);

		await latest.remove();
		expect(await db!.orders.findOne(inserted.uuid).exec()).toBeNull();
	});
});
