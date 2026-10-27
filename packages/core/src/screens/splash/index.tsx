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
		<View className="absolute inset-0 flex items-center justify-center bg-[#F0F4F8]">
			<VStack className="w-48 items-center justify-center">
				<View className="h-10 w-full" />
				<Logo width={120} height={120} />
				{/*
				 * The splash is always light, so the bar pins the light palette's
				 * secondary/primary (apps/main/global.css) rather than following
				 * the system dark mode.
				 */}
				<Progress
					sharedValue={progress}
					className="bg-[#5b748e]/20"
					indicatorClassName="bg-[#006aa7]"
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
