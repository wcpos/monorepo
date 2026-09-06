import type { StoreDatabase } from '@wcpos/database';

import { persistPrinterProfile } from './persist-printer-profile';

jest.mock('uuid', () => ({ v4: () => 'generated-id' }));

function fakeCollection(rows: { id: string; address?: string; isDefault?: boolean }[]) {
	const docs = rows.map((row) => ({
		...row,
		patch: jest.fn(async (patch: Record<string, unknown>) => Object.assign(row, patch)),
	}));
	const match = (selector: Record<string, unknown>) =>
		docs.filter((d) => Object.entries(selector).every(([k, v]) => (d as never)[k] === v));
	return {
		docs,
		insert: jest.fn(async () => {}),
		find: (q: { selector: Record<string, unknown> }) => ({ exec: async () => match(q.selector) }),
		findOne: (q: string | { selector: Record<string, unknown> }) => ({
			exec: async () =>
				typeof q === 'string'
					? (docs.find((d) => d.id === q) ?? null)
					: (match(q.selector)[0] ?? null),
		}),
	};
}
const data = {
	name: 'TM-m30III',
	address: '192.168.1.131',
	port: 443,
	vendor: 'epson',
	language: 'esc-pos',
	connectionType: 'network',
	columns: 48,
	autoCut: true,
	autoOpenDrawer: false,
	isDefault: false,
} as never;

it('updates the row that already has the address instead of adding a twin', async () => {
	const collection = fakeCollection([{ id: 'existing', address: '192.168.1.131' }]);
	const storeDB = { collections: { printer_profiles: collection } } as unknown as StoreDatabase;
	const id = await persistPrinterProfile(storeDB, data);
	expect(id).toBe('existing');
	expect(collection.insert).not.toHaveBeenCalled();
	expect(collection.docs[0].patch).toHaveBeenCalledWith(
		expect.objectContaining({ address: '192.168.1.131', columns: 48 })
	);
});

it('inserts when the address is new', async () => {
	const collection = fakeCollection([{ id: 'other', address: '192.168.1.150' }]);
	const storeDB = { collections: { printer_profiles: collection } } as unknown as StoreDatabase;
	const id = await persistPrinterProfile(storeDB, data);
	expect(id).not.toBe('other');
	expect(collection.insert).toHaveBeenCalledTimes(1);
});
