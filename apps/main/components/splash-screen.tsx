import React from 'react';
import { View } from 'react-native';

import * as SplashScreen from 'expo-splash-screen';

import { Logo } from '@wcpos/components/logo';
import { Progress } from '@wcpos/components/progress';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

// Keep the splash screen visible while we get the js SplashScreen ready
SplashScreen.preventAutoHideAsync();

/**
 * NOTE: the ThemeProvider is not loaded yet, so we can't use any theme related components here
 * @TODO - should we have a timeout and a way to force clear the local DBs if it takes too long?
 */
export function Splash({ progress = 0, message }: { progress?: number; message?: string }) {
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
				{message && <Text className="text-muted-foreground text-center text-sm">{message}</Text>}
				<View className="h-10 w-full">
					<Progress value={progress} />
				</View>
			</VStack>
		</View>
	);
}
