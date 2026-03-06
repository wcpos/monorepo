type ReceiptData = Record<string, unknown> | null | undefined;

describe('receipt data selection logic', () => {
	const localData = { meta: { order_number: '123' }, source: 'local' };
	const apiData: ReceiptData = {
		meta: { order_number: '123' },
		source: 'api',
		extra_field: 'server-only',
	};

	it('uses API data when available', () => {
		const result = apiData ?? localData;
		expect(result).toBe(apiData);
	});

	it('falls back to local data when API data is null', () => {
		const nullData: ReceiptData = null;
		const result = nullData ?? localData;
		expect(result).toBe(localData);
	});

	it('falls back to local data when API data is undefined', () => {
		const undefinedData: ReceiptData = undefined;
		const result = undefinedData ?? localData;
		expect(result).toBe(localData);
	});
});

describe('isSyncing computation', () => {
	it('is true when loading and no API data yet', () => {
		const isLoading = true;
		const apiReceiptData = null;
		const isSyncing = isLoading && !apiReceiptData;
		expect(isSyncing).toBe(true);
	});

	it('is false when loading is complete', () => {
		const isLoading = false;
		const apiReceiptData = { data: 'some data' };
		const isSyncing = isLoading && !apiReceiptData;
		expect(isSyncing).toBe(false);
	});

	it('is false when API data has arrived even if loading flag is stale', () => {
		const isLoading = true;
		const apiReceiptData = { data: 'some data' };
		const isSyncing = isLoading && !apiReceiptData;
		expect(isSyncing).toBe(false);
	});

	it('is false when not loading and no data (offline, no fetch attempted)', () => {
		const isLoading = false;
		const apiReceiptData = null;
		const isSyncing = isLoading && !apiReceiptData;
		expect(isSyncing).toBe(false);
	});
});
