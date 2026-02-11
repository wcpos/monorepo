import * as React from 'react';

import { useSharedValue } from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

interface SplashProgressState {
	progress: SharedValue<number>;
	setProgress: (progress: number) => void;
	incrementProgress: (amount: number) => void;
}

const SplashProgressContext = React.createContext<SplashProgressState | undefined>(undefined);

interface SplashProgressProviderProps {
	children: React.ReactNode;
	initialProgress?: number;
}

export function SplashProgressProvider({
	children,
	initialProgress = 0,
}: SplashProgressProviderProps) {
	const progress = useSharedValue(initialProgress);

	const setProgress = React.useCallback(
		(newProgress: number) => {
			'worklet';
			progress.value = newProgress;
		},
		[progress]
	);

	const incrementProgress = React.useCallback(
		(amount: number) => {
			'worklet';
			progress.value = Math.min(100, progress.value + amount);
		},
		[progress]
	);

	const value = React.useMemo(
		() => ({
			progress,
			setProgress,
			incrementProgress,
		}),
		[progress, setProgress, incrementProgress]
	);

	return <SplashProgressContext.Provider value={value}>{children}</SplashProgressContext.Provider>;
}

export const useSplashProgress = () => {
	const context = React.useContext(SplashProgressContext);
	if (!context) {
		throw new Error('useSplashProgress must be called within SplashProgressProvider');
	}
	return context;
};

/**
 * Hook for providers to register their loading progress
 * This automatically manages progress increments for the provider
 */
export const useProviderProgress = (
	providerName: string,
	isLoading: boolean,
	progressAmount: number = 10
) => {
	const { incrementProgress } = useSplashProgress();
	const hasIncrementedRef = React.useRef(false);

	React.useEffect(() => {
		if (!isLoading && !hasIncrementedRef.current) {
			incrementProgress(progressAmount);
			hasIncrementedRef.current = true;
		}
	}, [isLoading, incrementProgress, progressAmount, providerName]);
};
