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
	flagBeforeClear = flagAfterClear,
}: {
	clearAllDB?: jest.Mock;
	flagAfterClear?: 'scheduled' | 'not-scheduled' | 'unknown';
	flagBeforeClear?: 'scheduled' | 'not-scheduled' | 'unknown';
} = {}) {
	jest.resetModules();

	let flag = flagBeforeClear;
	const readClearLocalDataOnNextLoadFlag = jest.fn(() => flag);
	const unscheduleClearLocalDataOnNextLoad = jest.fn(() => {
		flag = flagAfterClear;
	});

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

	const { performScheduledClear, useClearLocalDataOnStartup } = jest.requireActual<
		typeof import('./clear-local-data-on-startup')
	>('./clear-local-data-on-startup');
	// From the same post-reset registry as the module under test, so the hook and the
	// renderer share one React. `pure`: no auto-cleanup hooks registered inside a test.
	const { Platform } = jest.requireActual<typeof import('react-native')>('react-native');
	const { renderHook, act } = jest.requireActual<
		typeof import('@testing-library/react-native/pure')
	>('@testing-library/react-native/pure');

	return {
		performScheduledClear,
		useClearLocalDataOnStartup,
		clearAllDB,
		unscheduleClearLocalDataOnNextLoad,
		Platform,
		renderHook,
		act,
	};
}

const relaunchingClear = () =>
	jest.fn().mockResolvedValue({ success: true, relaunching: true, message: 'relaunching' });

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

	it("returns 'relaunching' when the main process will relaunch to clear, and unschedules the flag", async () => {
		const { performScheduledClear, unscheduleClearLocalDataOnNextLoad } = loadPerformScheduledClear(
			{ clearAllDB: relaunchingClear() }
		);

		await expect(performScheduledClear()).resolves.toBe('relaunching');
		expect(unscheduleClearLocalDataOnNextLoad).toHaveBeenCalled();
	});

	it("returns 'blocked' when the main process will relaunch but the flag survives", async () => {
		const { performScheduledClear } = loadPerformScheduledClear({
			clearAllDB: relaunchingClear(),
			flagAfterClear: 'scheduled',
		});

		await expect(performScheduledClear()).resolves.toBe('blocked');
	});

	it("a declined dialog unschedules the flag and returns 'done' so the app hydrates", async () => {
		const { performScheduledClear, unscheduleClearLocalDataOnNextLoad } = loadPerformScheduledClear(
			{
				clearAllDB: jest
					.fn()
					.mockResolvedValue({ success: false, declined: true, message: 'declined' }),
			}
		);

		await expect(performScheduledClear()).resolves.toBe('done');
		expect(unscheduleClearLocalDataOnNextLoad).toHaveBeenCalled();
	});
});

describe('useClearLocalDataOnStartup', () => {
	const globalWithLocation = globalThis as { location?: unknown };
	const originalLocation = globalWithLocation.location;

	afterEach(() => {
		globalWithLocation.location = originalLocation;
	});

	it('does not reload while the main process relaunches', async () => {
		const {
			useClearLocalDataOnStartup,
			unscheduleClearLocalDataOnNextLoad,
			Platform,
			renderHook,
			act,
		} = loadPerformScheduledClear({
			clearAllDB: relaunchingClear(),
			flagBeforeClear: 'scheduled',
		});
		const reload = jest.fn();
		globalWithLocation.location = { reload };
		const originalOS = Platform.OS;
		Platform.OS = 'web';

		try {
			const { result, unmount } = await renderHook(() => useClearLocalDataOnStartup());
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});

			expect(unscheduleClearLocalDataOnNextLoad).toHaveBeenCalled();
			expect(reload).not.toHaveBeenCalled();
			expect(result.current).toBe('clearing');
			await unmount();
		} finally {
			Platform.OS = originalOS;
		}
	});
});
