import { getLogger } from '@wcpos/utils/logger';

import { hydrationSteps } from './hydration-steps';
import { useHydrationSuspense } from './use-hydration-suspense';

const mockSetProgress = jest.fn();

jest.mock('react', () => ({
	...jest.requireActual('react'),
	use: jest.fn((promise: Promise<unknown>) => {
		throw promise;
	}),
}));

// Mutable array: each test installs its own steps. The hydration promise cache
// is module-level, so tests that reject must run before tests that resolve —
// a rejection clears the cache, a resolution would be served to the next test.
jest.mock('./hydration-steps', () => ({
	hydrationSteps: [],
}));

jest.mock('../../screens/splash', () => ({
	useSplashProgress: () => ({ setProgress: mockSetProgress }),
}));

const steps = hydrationSteps as unknown as Record<string, unknown>[];
const hydrationLogger = getLogger(['wcpos', 'app-state', 'hydration']);

// The mocked `use` throws the hydration promise; each test catches it inline.
// (A shared helper trips rules-of-hooks/react-compiler whatever it is named.)

beforeEach(() => {
	jest.clearAllMocks();
	steps.length = 0;
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
	expect(hydrationLogger.debug).toHaveBeenCalledWith('Hydration promise cleared after failure', {
		context: { error: serializedError },
	});
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
		'Hydration promise cleared after failure',
		expect.anything()
	);
});
