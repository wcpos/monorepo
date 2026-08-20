import { use } from 'react';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { type HydrationContext, hydrationSteps } from './hydration-steps';
import { useSplashProgress } from '../../screens/splash';

const hydrationLogger = getLogger(['wcpos', 'app-state', 'hydration']);

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

	hydrationLogger.debug('Creating hydration promise');

	globalHydrationPromise = (async () => {
		let currentContext = {} as HydrationContext;
		let totalProgress = 0;

		hydrationLogger.debug('Starting hydration steps');
		setProgress(1);

		for (let i = 0; i < hydrationSteps.length; i++) {
			const step = hydrationSteps[i];

			if (step.shouldExecute && !step.shouldExecute(currentContext)) {
				hydrationLogger.debug(`Skipping step ${step.name} - shouldExecute returned false`);
				continue;
			}

			hydrationLogger.debug(`Executing step ${step.name} (${i + 1}/${hydrationSteps.length})`);
			setProgress(totalProgress);

			try {
				const stepResult = await step.execute(currentContext);
				currentContext = { ...currentContext, ...stepResult };
				totalProgress += step.progressIncrement;

				hydrationLogger.debug(`Step ${step.name} completed`);
				setProgress(totalProgress);

				await new Promise((resolve) => setTimeout(resolve, 300));
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				hydrationLogger.error(`Hydration step ${step.name} failed`, {
					code: ERROR_CODES.APP_START_FAILED,
					context: {
						step: step.name,
						failSoft: !!step.failSoft,
						error: { name: error.name, message: error.message, stack: error.stack },
					},
				});
				if (!step.failSoft) {
					throw error;
				}
				// Fail-soft step: keep booting from the context accumulated so far.
				// Rejecting here clears the promise cache and the next render retries
				// the identical failing work — an infinite splash loop.
				totalProgress += step.progressIncrement;
				setProgress(totalProgress);
			}
		}

		hydrationLogger.debug('All hydration steps completed');
		setProgress(100);
		return currentContext;
	})().catch((err) => {
		const error = err instanceof Error ? err : new Error(String(err));
		// Step failures are reported above; this clears the cache so a remount retries.
		hydrationLogger.debug('Hydration promise cleared after failure', {
			context: {
				error: { name: error.name, message: error.message, stack: error.stack },
			},
		});
		globalHydrationPromise = null;
		throw err;
	});

	return globalHydrationPromise;
}

/**
 * Hook that manages hydration using suspense-throwing promises.
 * Each step throws suspense, executes async work, then resolves to move to next step.
 *
 * `use()` is called unconditionally at the top level: while the promise is pending
 * it suspends (handled by the nearest <Suspense> boundary), and if it rejects the
 * rejection is re-thrown during render (handled by the nearest error boundary).
 */
export const useHydrationSuspense = (): UseHydrationSuspenseReturn => {
	const { setProgress } = useSplashProgress();

	const promise = getOrCreateHydrationPromise(setProgress);

	// Suspends until resolved; re-throws on rejection for the error boundary to catch.
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
};
