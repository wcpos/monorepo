import React from 'react';
import { View } from 'react-native';

import * as SplashScreen from 'expo-splash-screen';
import { useDerivedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Logo } from '@wcpos/components/logo';
import { Progress } from '@wcpos/components/progress';
import { VStack } from '@wcpos/components/vstack';

import { useSplashProgress } from './progress-provider';

// Keep the splash screen visible while we get the js SplashScreen ready
void SplashScreen.preventAutoHideAsync();

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
			scheduleOnRN(hideSplash);
		}
	}, [progress.value, hideSplash]);

	return (
		<View className="bg-splash absolute inset-0 flex items-center justify-center">
			<VStack className="w-48 items-center justify-center">
				<View className="h-10 w-full" />
				<Logo width={120} height={120} />
				{/* The splash is always light, so its bar never follows the theme (global.css). */}
				<Progress
					sharedValue={progress}
					className="bg-splash-track"
					indicatorClassName="bg-splash-indicator"
				/>
			</VStack>
		</View>
	);
}

export {
	SplashProgressProvider,
	useProviderProgress,
	useSplashProgress,
} from './progress-provider';
