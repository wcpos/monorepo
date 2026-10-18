let resetHydration: typeof import('./use-hydration-suspense').resetHydration;
let useHydrationSuspense: typeof import('./use-hydration-suspense').useHydrationSuspense;
let markErrorReported: typeof import('@wcpos/utils/logger').markErrorReported;
let hydrationLogger: ReturnType<typeof import('@wcpos/utils/logger').getLogger>;
let steps: Record<string, unknown>[];

const mockSetProgress = jest.fn();

jest.mock('react', () => ({
	...jest.requireActual('react'),
	use: jest.fn((promise: Promise<unknown>) => {
		throw promise;
	}),
}));

// Mutable array: each test installs its own steps. The hydration promise cache
// persists after resolution, so each test loads a fresh module.
jest.mock('./hydration-steps', () => ({
	hydrationSteps: [],
}));

jest.mock('../../screens/splash', () => ({
	useSplashProgress: () => ({ setProgress: mockSetProgress }),
}));

// The mocked `use` throws the hydration promise; each test catches it inline.
// (A shared helper trips rules-of-hooks/react-compiler whatever it is named.)

beforeEach(() => {
	jest.resetModules();
	jest.clearAllMocks();
	({ resetHydration, useHydrationSuspense } = jest.requireActual('./use-hydration-suspense'));
	({ hydrationSteps: steps } = jest.requireMock('./hydration-steps'));
	const logger = jest.requireActual<typeof import('@wcpos/utils/logger')>('@wcpos/utils/logger');
	markErrorReported = logger.markErrorReported;
	hydrationLogger = logger.getLogger(['wcpos', 'app-state', 'hydration']);
});

it('serializes a failed hydration error in both logger contexts', async () => {
	steps.push({
		name: 'load-store',
		progressIncrement: 100,
		execute: jest.fn().mockRejectedValue(new Error('Store database failed')),
	});

	let suspendedPromise: Promise<unknown> | undefined;
	try {
		useHydrationSuspense();
	} catch (error) {
		suspendedPromise = error as Promise<unknown>;
	}

	expect(suspendedPromise).toBeInstanceOf(Promise);
	const rejection = await suspendedPromise!.catch((error: unknown) => error);
	const serializedError = {
		name: 'Error',
		message: 'Store database failed',
		stack: (rejection as Error).stack,
	};

	expect(hydrationLogger.error).toHaveBeenCalledWith('Hydration step load-store failed', {
		code: 'CLIENT101',
		context: { step: 'load-store', failSoft: false, error: serializedError },
	});
	expect(hydrationLogger.debug).toHaveBeenCalledWith(
		'Hydration rejection cached so the next render throws it to the boundary',
		{ context: { error: serializedError } }
	);
	// The root ErrorBoundary catches this rethrow next; it must not report it again.
	expect(markErrorReported).toHaveBeenCalledWith(rejection);
});

it('a hard step failure keeps the rejected promise cached so the next render reaches the boundary instead of re-running hydration', async () => {
	const failure = new Error('Store database failed');
	const execute = jest.fn().mockRejectedValue(failure);
	steps.push({ name: 'hydrate-session', progressIncrement: 100, execute });

	let firstPromise: Promise<unknown> | undefined;
	try {
		useHydrationSuspense();
	} catch (error) {
		firstPromise = error as Promise<unknown>;
	}
	await expect(firstPromise).rejects.toBe(failure);

	let secondPromise: Promise<unknown> | undefined;
	try {
		useHydrationSuspense();
	} catch (error) {
		secondPromise = error as Promise<unknown>;
	}
	await expect(secondPromise).rejects.toBe(failure);
	expect(secondPromise).toBe(firstPromise);
	expect(execute).toHaveBeenCalledTimes(1);
});

it('resetHydration lets the next render re-run hydration', async () => {
	const failure = new Error('Store database failed');
	const execute = jest.fn().mockRejectedValue(failure);
	steps.push({ name: 'hydrate-session', progressIncrement: 100, execute });

	let firstPromise: Promise<unknown> | undefined;
	try {
		useHydrationSuspense();
	} catch (error) {
		firstPromise = error as Promise<unknown>;
	}
	await expect(firstPromise).rejects.toBe(failure);

	resetHydration();

	let secondPromise: Promise<unknown> | undefined;
	try {
		useHydrationSuspense();
	} catch (error) {
		secondPromise = error as Promise<unknown>;
	}
	await expect(secondPromise).rejects.toBe(failure);
	expect(secondPromise).not.toBe(firstPromise);
	expect(execute).toHaveBeenCalledTimes(2);
});

it('resetHydration keeps a fulfilled hydration cached', async () => {
	const execute = jest.fn().mockResolvedValue({ user: 'user-1' });
	steps.push({ name: 'hydrate-session', progressIncrement: 100, execute });

	let firstPromise: Promise<unknown> | undefined;
	try {
		useHydrationSuspense();
	} catch (error) {
		firstPromise = error as Promise<unknown>;
	}
	await expect(firstPromise).resolves.toEqual({ user: 'user-1' });

	resetHydration();

	let secondPromise: Promise<unknown> | undefined;
	try {
		useHydrationSuspense();
	} catch (error) {
		secondPromise = error as Promise<unknown>;
	}
	await expect(secondPromise).resolves.toEqual({ user: 'user-1' });
	expect(secondPromise).toBe(firstPromise);
	expect(execute).toHaveBeenCalledTimes(1);
});

it('continues past a failed fail-soft step instead of rejecting the boot', async () => {
	// Regression for the embedded-boot infinite splash loop: PROCESS_INITIAL_PROPS
	// threw (RxDB VD2 on an unknown server field), the rejection cleared the
	// promise cache, and the next render retried the identical failing work.
	const failure = new Error('Additional properties not allowed: locale');
	steps.push(
		{
			name: 'process-initial-props',
			progressIncrement: 20,
			failSoft: true,
			execute: jest.fn().mockRejectedValue(failure),
		},
		{
			name: 'hydrate-session',
			progressIncrement: 80,
			execute: jest.fn().mockResolvedValue({ user: 'user-1' }),
		}
	);

	let suspendedPromise: Promise<unknown> | undefined;
	try {
		useHydrationSuspense();
	} catch (error) {
		suspendedPromise = error as Promise<unknown>;
	}

	expect(suspendedPromise).toBeInstanceOf(Promise);
	const context = (await suspendedPromise) as Record<string, unknown>;

	// Boot completed on the surviving steps.
	expect(context).toEqual({ user: 'user-1' });
	expect(mockSetProgress).toHaveBeenCalledWith(100);
	// Nothing was rethrown, so nothing needs marking for the boundary.
	expect(markErrorReported).not.toHaveBeenCalled();

	// The failure is still reported loudly, and the cache was NOT cleared.
	expect(hydrationLogger.error).toHaveBeenCalledWith(
		'Hydration step process-initial-props failed',
		{
			code: 'CLIENT101',
			context: {
				step: 'process-initial-props',
				failSoft: true,
				error: { name: failure.name, message: failure.message, stack: failure.stack },
			},
		}
	);
	expect(hydrationLogger.debug).not.toHaveBeenCalledWith(
		'Hydration rejection cached so the next render throws it to the boundary',
		expect.anything()
	);
});
