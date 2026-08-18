import { getLogger } from '@wcpos/utils/logger';

import { useHydrationSuspense } from './use-hydration-suspense';

const mockSetProgress = jest.fn();

jest.mock('react', () => ({
	...jest.requireActual('react'),
	use: jest.fn((promise: Promise<unknown>) => {
		throw promise;
	}),
}));

jest.mock('./hydration-steps', () => ({
	hydrationSteps: [
		{
			name: 'load-store',
			progressIncrement: 100,
			execute: jest.fn().mockRejectedValue(new Error('Store database failed')),
		},
	],
}));

jest.mock('../../screens/splash', () => ({
	useSplashProgress: () => ({ setProgress: mockSetProgress }),
}));

it('serializes a failed hydration error in both logger contexts', async () => {
	const hydrationLogger = getLogger(['wcpos', 'app-state', 'hydration']);
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
		context: { step: 'load-store', error: serializedError },
	});
	expect(hydrationLogger.debug).toHaveBeenCalledWith('Hydration promise cleared after failure', {
		context: { error: serializedError },
	});
});
