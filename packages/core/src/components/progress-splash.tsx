import React from 'react';
import { View } from 'react-native';

import * as SplashScreen from 'expo-splash-screen';

import { Logo } from '@wcpos/components/logo';
import { Progress } from '@wcpos/components/progress';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useSplashProgress } from '../contexts/splash-progress';

// Keep the splash screen visible while we get the js SplashScreen ready
SplashScreen.preventAutoHideAsync();

/**
 * Splash component that automatically uses the global progress context
 */
export const ProgressSplash = () => {
	const { progress, message } = useSplashProgress();

	React.useEffect(() => {
		// Once our JS-based splash is ready to be shown, hide the native splash.
		// Then we conditionally render our custom splash UI or the real app.
		if (progress > 0) {
			SplashScreen.hideAsync().catch(() => {
				/* handle error */
			});
		}
	}, [progress]);

	return (
		<View className="absolute inset-0 flex items-center justify-center bg-white">
			<VStack className="w-48 items-center justify-center">
				<View className="h-10 w-full" />
				<Logo width={120} height={120} />
				<View className="h-10 w-full">
					<Progress value={progress} />
				</View>
				{message && <Text className="text-muted-foreground text-center text-sm">{message}</Text>}
			</VStack>
		</View>
	);
};
