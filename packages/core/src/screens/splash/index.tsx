import React from 'react';
import { View } from 'react-native';

import * as SplashScreen from 'expo-splash-screen';
import { runOnJS, useDerivedValue } from 'react-native-reanimated';

import { Logo } from '@wcpos/components/logo';
import { Progress } from '@wcpos/components/progress';
import { VStack } from '@wcpos/components/vstack';

import { useSplashProgress } from './progress-provider';

// Keep the splash screen visible while we get the js SplashScreen ready
SplashScreen.preventAutoHideAsync();

/**
 * Splash component that automatically uses the global progress context
 */
export function Splash() {
	const { progress } = useSplashProgress();

	const hideSplash = React.useCallback(() => {
		SplashScreen.hideAsync().catch(() => {
			/* handle error */
		});
	}, []);

	// Use derived value to automatically hide splash when progress starts
	useDerivedValue(() => {
		if (progress.value > 0) {
			runOnJS(hideSplash)();
		}
	}, [progress.value, hideSplash]);

	return (
		<View className="absolute inset-0 flex items-center justify-center bg-[#F0F4F8]">
			<VStack className="w-48 items-center justify-center">
				<View className="h-10 w-full" />
				<Logo width={120} height={120} />
				<Progress sharedValue={progress} />
			</VStack>
		</View>
	);
}

export {
	SplashProgressProvider,
	useProviderProgress,
	useSplashProgress,
} from './progress-provider';
