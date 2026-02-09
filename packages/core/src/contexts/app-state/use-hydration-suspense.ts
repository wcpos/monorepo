import { use } from 'react';

import { type HydrationContext, hydrationSteps } from './hydration-steps';
import { useSplashProgress } from '../../screens/splash';

interface UseHydrationSuspenseReturn {
	isComplete: boolean;
	context: HydrationContext;
	progress: number;
	currentMessage: string;
	currentStep: string;
	error: Error | null;
}

/**
 * Module-level cache for the hydration promise.
 * Stored outside the hook so it persists across renders/remounts.
 */
let globalHydrationPromise: Promise<HydrationContext> | null = null;

function getOrCreateHydrationPromise(
	setProgress: (value: number) => void
): Promise<HydrationContext> {
	if (globalHydrationPromise) {
		return globalHydrationPromise;
	}

	console.log('Creating ONE hydration promise...');

	globalHydrationPromise = (async () => {
		let currentContext = {} as HydrationContext;
		let totalProgress = 0;

		console.log('Starting hydration steps...');
		setProgress(1);

		for (let i = 0; i < hydrationSteps.length; i++) {
			const step = hydrationSteps[i];

			if (step.shouldExecute && !step.shouldExecute(currentContext)) {
				console.log(`Skipping step ${step.name} - shouldExecute returned false`);
				continue;
			}

			console.log(`Executing step ${step.name} (${i + 1}/${hydrationSteps.length})`);
			setProgress(totalProgress);

			try {
				const stepResult = await step.execute(currentContext);
				currentContext = { ...currentContext, ...stepResult };
				totalProgress += step.progressIncrement;

				console.log(`Step ${step.name} completed`);
				setProgress(totalProgress);

				await new Promise((resolve) => setTimeout(resolve, 300));
			} catch (err) {
				console.log(`Step ${step.name} failed:`, err);
				const error = err instanceof Error ? err : new Error(String(err));
				throw error;
			}
		}

		console.log('All hydration steps completed!');
		setProgress(100);
		return currentContext;
	})().catch((err) => {
		console.log('Hydration failed:', err);
		throw err;
	});

	return globalHydrationPromise;
}

/**
 * Hook that manages hydration using suspense-throwing promises.
 * Each step throws suspense, executes async work, then resolves to move to next step.
 */
export const useHydrationSuspense = (): UseHydrationSuspenseReturn => {
	const { setProgress } = useSplashProgress();

	const promise = getOrCreateHydrationPromise(setProgress);

	// Use the promise - this will throw suspense until resolved
	try {
		const result = use(promise);

		// Promise resolved, return the result directly
		return {
			isComplete: true,
			context: result,
			progress: 100,
			currentMessage: 'Ready!',
			currentStep: 'COMPLETE',
			error: null,
		};
	} catch (promiseOrError: unknown) {
		// If it's a promise (suspense), let it bubble up
		if (promiseOrError && typeof (promiseOrError as Promise<unknown>).then === 'function') {
			throw promiseOrError;
		}
		// If it's an error, handle it
		if (promiseOrError instanceof Error) {
			return {
				isComplete: false,
				context: {},
				progress: 0,
				currentMessage: 'Error occurred',
				currentStep: 'ERROR',
				error: promiseOrError,
			};
		}
		throw promiseOrError;
	}
};
