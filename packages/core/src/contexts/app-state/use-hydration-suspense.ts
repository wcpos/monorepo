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
 * Hook that manages hydration using suspense-throwing promises
 * Each step throws suspense, executes async work, then resolves to move to next step
 */
// Create a single promise outside the component to prevent recreation
let globalHydrationPromise: Promise<HydrationContext> | null = null;

export const useHydrationSuspense = (): UseHydrationSuspenseReturn => {
	const { setProgress } = useSplashProgress();

	// Create the promise only once globally
	if (!globalHydrationPromise) {
		console.log('🚀 Creating ONE hydration promise...');

		globalHydrationPromise = (async () => {
			let currentContext = {} as HydrationContext;
			let totalProgress = 0;

			console.log('🔄 Starting hydration steps...');

			// Initial progress
			setProgress(1);

			for (let i = 0; i < hydrationSteps.length; i++) {
				const step = hydrationSteps[i];

				// Check if step should execute
				if (step.shouldExecute && !step.shouldExecute(currentContext)) {
					console.log(`⏭️ Skipping step ${step.name} - shouldExecute returned false`);
					continue;
				}

				console.log(`🔄 Executing step ${step.name} (${i + 1}/${hydrationSteps.length})`);
				console.log(`📊 Current context:`, currentContext);

				// Update progress at start of step
				setProgress(totalProgress);

				try {
					// Execute the step
					const stepResult = await step.execute(currentContext);

					// Update context and progress
					currentContext = { ...currentContext, ...stepResult };
					totalProgress += step.progressIncrement;

					console.log(`✅ Step ${step.name} completed`);
					console.log(`📊 Updated context:`, currentContext);

					// Update progress after completion
					setProgress(totalProgress);

					// Small delay to see progress
					await new Promise((resolve) => setTimeout(resolve, 300));
				} catch (err) {
					console.log(`❌ Step ${step.name} failed:`, err);
					const error = err instanceof Error ? err : new Error(String(err));
					throw error;
				}
			}

			console.log('🎉 All hydration steps completed!');
			console.log('📊 Final context:', currentContext);

			// Final progress update
			setProgress(100);
			return currentContext;
		})().catch((err) => {
			console.log('❌ Hydration failed:', err);
			throw err;
		});
	}

	// Use the promise - this will throw suspense until resolved
	try {
		const result = use(globalHydrationPromise);

		// Promise resolved, return the result directly
		return {
			isComplete: true,
			context: result,
			progress: 100,
			currentMessage: 'Ready!',
			currentStep: 'COMPLETE',
			error: null,
		};
	} catch (promiseOrError) {
		// If it's a promise (suspense), let it bubble up
		if (promiseOrError && typeof promiseOrError.then === 'function') {
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
