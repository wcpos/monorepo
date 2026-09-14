/**
 * Regression coverage for the empty receipt-template picker (dev-pro, 2026-08-19).
 *
 * The server's `/templates` payload carries fields the local schema doesn't
 * declare (`preview_data`, `gallery_key`, `is_premade`, `tax_display`,
 * `file_path`, `language`, `category`, ...). `parseRestResponse` coerces ONE
 * document — handed the whole array it returned it untouched, so unpruned rows
 * reached `bulkUpsert`, and on validating storage (dev builds wrap storage with
 * z-schema) every row was rejected *silently*: `bulkUpsert` reports failures in
 * its result instead of throwing. The local collection stayed empty, so the
 * receipt modal hid the template switcher and disabled the PDF download.
 *
 * These run against a real RxDB with z-schema-validating memory storage — the
 * same wrapper the dev app uses — because the bug lives in the interaction
 * between parse (array vs document) and silent bulkUpsert validation failures.
 */
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import '@wcpos/database/plugins';
import { storeCollections, type TemplateCollection } from '@wcpos/database/collections';

import { syncTemplates } from './use-templates-sync';

jest.mock('uuid', () => ({
	v4: () => `uuid-${Math.random().toString(36).slice(2)}`,
}));

// Only syncTemplates is under test; the hook wrapper's dependencies pull in
// native modules (netinfo via use-rest-http-client) and the query runtime.
jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: jest.fn(),
}));
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: jest.fn(),
}));

jest.setTimeout(30000);

/**
 * Mirrors the live dev-pro `/wcpos/v2/templates` response shape: one virtual
 * legacy template (no `status`, no `content`) plus published DB templates, all
 * carrying server-side fields the local schema does not declare.
 */
const serverExtras = {
	category: 'receipt',
	language: 'php',
	file_path: '/var/www/html/wp-content/plugins/woocommerce-pos/templates/receipt.php',
	is_disabled: false,
};

const dbTemplateExtras = {
	...serverExtras,
	language: 'mustache',
	is_premade: true,
	gallery_key: 'standard',
	gallery_version: '1.0.0',
	preview_data: { order: { id: 1 } },
	tax_display: 'itemized',
	date_created: '2026-08-19T17:47:14',
	date_modified: '2026-08-19T17:47:14',
};

const serverPayload = [
	{
		id: 'plugin-core',
		uuid: '5806abe3-b79b-5002-99c0-685d5356a832',
		title: 'Legacy PHP template',
		description: '',
		type: 'receipt',
		engine: 'legacy-php',
		output_type: 'html',
		paper_width: null,
		is_virtual: true,
		source: 'plugin',
		menu_order: 0,
		is_active: true,
		offline_capable: false,
		date_modified_gmt: '2026-08-19T17:47:14',
		...serverExtras,
	},
	...[64965, 64966, 64967, 64968].map((id, i) => ({
		id,
		uuid: `00000000-0000-4000-8000-00000000000${i}`,
		title: `Receipt template ${id}`,
		description: '',
		type: 'receipt',
		status: 'publish',
		engine: i === 2 ? 'thermal' : 'logicless',
		output_type: i === 2 ? 'escpos' : 'html',
		paper_width: i === 2 ? '80mm' : null,
		content: '<div>{{store.name}}</div>',
		is_virtual: false,
		source: 'custom',
		menu_order: 0,
		is_active: false,
		offline_capable: true,
		date_modified_gmt: '2026-08-19T17:47:14',
		...dbTemplateExtras,
	})),
];

let db: RxDatabase<{ templates: TemplateCollection }>;

beforeEach(async () => {
	db = await createRxDatabase<{ templates: TemplateCollection }>({
		name: `templates-sync-${Math.random().toString(36).slice(2)}`,
		storage: wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
		ignoreDuplicate: true,
	});
	await db.addCollections({ templates: storeCollections.templates });
});

afterEach(async () => {
	await db.close();
});

const fakeHttpClient = (data: unknown) => ({
	get: jest.fn(async () => ({ data })),
});

type SyncTemplatesHttpClient = Parameters<typeof syncTemplates>[1];
// Type-only pin: the response boundary must never regress to `any`.
// @ts-expect-error A synchronous scalar is not a valid HTTP response.
const invalidHttpClient: SyncTemplatesHttpClient = { get: () => 42 };
void invalidHttpClient;

describe('syncTemplates', () => {
	it.each([
		['global', [64967, 64965, 64966, 'plugin-core', 64968]],
		['store-specific', [64968, 'plugin-core', 64965]],
	] as const)('preserves %s display order on initial sync and reorder', async (_scope, ids) => {
		const collection = db.collections.templates;
		const query = collection.find({
			selector: { type: 'receipt' },
			sort: [{ menu_order: 'asc' }],
		});
		for (const order of [ids, [...ids].reverse()]) {
			// The API orders the array, not the posts' menu_order fields. The
			// store-specific response is already filtered and ordered by the server.
			const payload = order.map((id, index) => ({
				...serverPayload.find((template) => template.id === id)!,
				is_active: index === 0,
			}));
			await syncTemplates(collection, fakeHttpClient(payload));

			const docs = await query.exec();
			expect(docs.find((doc) => doc.is_active)?.id).toBe(order[0]);
			expect(docs.map((doc) => doc.id)).toEqual(order);
		}
	});

	it('upserts every template despite undeclared server fields on validating storage', async () => {
		await syncTemplates(db.collections.templates, fakeHttpClient(serverPayload));

		// The exact read useActiveTemplates performs, including its publish/virtual filter.
		const docs = await db.collections.templates
			.find({ selector: { type: 'receipt' }, sort: [{ menu_order: 'asc' }] })
			.exec();
		const visible = docs.filter((doc: any) => doc.is_virtual || doc.status === 'publish');

		expect(docs).toHaveLength(serverPayload.length);
		expect(visible).toHaveLength(serverPayload.length);
		// Undeclared server fields must not survive into the stored documents.
		expect((docs[0] as any).toJSON()).not.toHaveProperty('gallery_key');
	});

	it('re-syncing the same payload is a stable upsert, not an insert conflict', async () => {
		const collection = db.collections.templates;
		await syncTemplates(collection, fakeHttpClient(serverPayload));
		await syncTemplates(collection, fakeHttpClient(serverPayload));

		const docs = await db.collections.templates.find().exec();
		expect(docs).toHaveLength(serverPayload.length);
	});

	it('ignores a non-array response body', async () => {
		await syncTemplates(db.collections.templates, fakeHttpClient({ code: 'rest_no_route' }));

		const docs = await db.collections.templates.find().exec();
		expect(docs).toHaveLength(0);
	});
});
