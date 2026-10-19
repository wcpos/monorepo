import { firstValueFrom, of } from 'rxjs';

import * as reads from '../../src/store-local';

it('does not create or seed read-state until subscribed', async () => {
	let watermark: number | undefined;
	const state = {
		get: () => watermark,
		get$: () => of(watermark),
		set: jest.fn(async (_path: string, modifier: () => number) => {
			watermark = modifier();
		}),
	};
	const storeDB = {
		collections: { logs: { count: () => ({ $: of(3) }) } },
		addState: jest.fn(async () => state),
	};
	const unread$ = reads.observeUnreadErrorCount(storeDB);
	expect(storeDB.addState).not.toHaveBeenCalled();
	expect(state.set).not.toHaveBeenCalled();
	expect(await firstValueFrom(unread$)).toBe(3);
	expect(state.set).toHaveBeenCalledTimes(1);
	await reads.markLogsRead(storeDB, 123);
	expect(watermark).toBe(123);
});

it('returns zero without a database and marking absent state is harmless', async () => {
	expect(await firstValueFrom(reads.observeUnreadErrorCount(null))).toBe(0);
	await expect(reads.markLogsRead(null, 123)).resolves.toBeUndefined();
});
