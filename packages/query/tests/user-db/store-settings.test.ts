import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { patchStoreSettings } from '../../src/user-db/store-settings';

import type { ReadonlyStoreRecord } from '../../src/user-db/records';

const t = (_key: string, { message }: { message: string }) => `Translated: ${message}`;
function fixture(hasDate = false) {
	let data: Record<string, unknown> = { theme: 'light', nested: { keep: true, value: 'latest' } };
	const latest = {
		toMutableJSON: () => data,
		incrementalModify: jest.fn(async (modify: (old: typeof data) => typeof data) => {
			data = modify(data);
			return latest;
		}),
	};
	const store = {
		id: 1,
		collection: {
			name: 'stores',
			schema: { jsonSchema: { properties: hasDate ? { date_modified_gmt: {} } : {} } },
		},
		getLatest: () => latest,
	} as unknown as ReadonlyStoreRecord;
	return { store, latest, data: () => data };
}

afterEach(() => {
	jest.useRealTimers();
	jest.clearAllMocks();
});

it.each([true, false])('stamps only when the schema has a date field (%s)', async (hasDate) => {
	jest.useFakeTimers().setSystemTime(new Date('2026-10-18T12:34:56.789Z'));
	const { store, data } = fixture(hasDate);
	await patchStoreSettings(store, { theme: 'dark', ignored: undefined }, t);
	expect(data().theme).toBe('dark');
	expect(data()).not.toHaveProperty('ignored');
	if (hasDate) expect(data().date_modified_gmt).toBe('2026-10-18T12:34:56');
	else expect(data()).not.toHaveProperty('date_modified_gmt');
});

it('expands dotted paths against the latest snapshot and clones incoming values', async () => {
	const { store, data } = fixture();
	const input = { nested: { value: 'input' } };
	await patchStoreSettings(store, input, t);
	input.nested.value = 'changed';
	expect(data().nested).toEqual({ value: 'input' });
	const result = await patchStoreSettings(store, { 'nested.other': 2, 'rows.0.name': 'row' }, t);
	expect(result?.changes).toEqual({
		nested: { value: 'input', other: 2 },
		rows: [{ name: 'row' }],
	});
});

it.each([new Error('disk full'), { rxdb: true, code: '422' }])(
	'logs and toasts a failed write and resolves undefined: %p',
	async (error) => {
		const { store, latest } = fixture();
		latest.incrementalModify.mockRejectedValueOnce(error);
		const message = error instanceof Error ? 'disk full' : 'rxdb 422';
		expect(await patchStoreSettings(store, { theme: 'dark' }, t)).toBeUndefined();
		expect(getLogger(['wcpos', 'mutations', 'local']).error).toHaveBeenCalledWith(
			'Local mutation failed',
			{
				code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
				showToast: true,
				toast: { title: `Translated: ${message}` },
				context: { documentId: null, collectionName: 'stores', error: message },
			}
		);
	}
);
