/**
 * performScheduledClear must fail closed: 'done' only when the databases were
 * cleared AND the armed flag is proven gone. Anything else is 'blocked' — the
 * app must not hydrate, or the flag's retry on a later launch would destroy
 * everything sold in between.
 */
jest.resetModules();

function loadPerformScheduledClear({
	clearAllDB = jest.fn().mockResolvedValue({
		success: true,
		message: 'cleared',
		databasesDeleted: 2,
	}),
	flagAfterClear = 'not-scheduled',
}: {
	clearAllDB?: jest.Mock;
	flagAfterClear?: 'scheduled' | 'not-scheduled' | 'unknown';
} = {}) {
	jest.resetModules();

	const readClearLocalDataOnNextLoadFlag = jest.fn().mockReturnValue(flagAfterClear);
	const unscheduleClearLocalDataOnNextLoad = jest.fn();

	jest.doMock('@wcpos/database', () => ({
		readClearLocalDataOnNextLoadFlag,
		unscheduleClearLocalDataOnNextLoad,
	}));
	jest.doMock('@wcpos/database/clear-all-db', () => ({ clearAllDB }));
	jest.doMock('@wcpos/core/utils/reload-app', () => ({ reloadApp: jest.fn() }));
	jest.doMock('@wcpos/utils/logger', () => ({
		getLogger: () => ({ info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
	}));
	jest.doMock('@wcpos/utils/logger/generated/error-codes.generated', () => ({
		ERROR_CODES: { UNEXPECTED_ERROR: 'UNEXPECTED_ERROR' },
	}));

	const { performScheduledClear } = jest.requireActual<
		typeof import('./clear-local-data-on-startup')
	>('./clear-local-data-on-startup');

	return { performScheduledClear, clearAllDB, unscheduleClearLocalDataOnNextLoad };
}

describe('performScheduledClear', () => {
	it("returns 'done' when the clear succeeds and the flag is verifiably gone", async () => {
		const { performScheduledClear, clearAllDB, unscheduleClearLocalDataOnNextLoad } =
			loadPerformScheduledClear();

		await expect(performScheduledClear()).resolves.toBe('done');
		expect(clearAllDB).toHaveBeenCalled();
		expect(unscheduleClearLocalDataOnNextLoad).toHaveBeenCalled();
	});

	it("returns 'blocked' when the flag survives the clear", async () => {
		const { performScheduledClear } = loadPerformScheduledClear({ flagAfterClear: 'scheduled' });

		await expect(performScheduledClear()).resolves.toBe('blocked');
	});

	it("returns 'blocked' when the flag state cannot be read after the clear", async () => {
		const { performScheduledClear } = loadPerformScheduledClear({ flagAfterClear: 'unknown' });

		await expect(performScheduledClear()).resolves.toBe('blocked');
	});

	it("returns 'blocked' when the clear itself throws, even part-way through", async () => {
		const { performScheduledClear, unscheduleClearLocalDataOnNextLoad } = loadPerformScheduledClear(
			{
				clearAllDB: jest.fn().mockRejectedValue(new Error('directory delete failed')),
			}
		);

		await expect(performScheduledClear()).resolves.toBe('blocked');
		expect(unscheduleClearLocalDataOnNextLoad).not.toHaveBeenCalled();
	});
});
