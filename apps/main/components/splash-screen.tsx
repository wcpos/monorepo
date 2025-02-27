import { View } from 'react-native';

import { Logo } from '@wcpos/components/logo';
import { Progress } from '@wcpos/components/progress';
import { VStack } from '@wcpos/components/vstack';

/**
 * NOTE: the ThemeProvider is not loaded yet, so we can't use any theme related components here
 * @TODO - should we have a timeout and a way to force clear the local DBs if it takes too long?
 */
export const Splash = ({ progress = 0 }: { progress?: number }) => {
	return (
		<View className="absolute inset-0 flex items-center justify-center bg-white">
			<VStack className="w-48 items-center justify-center">
				<View className="h-10 w-full" />
				<Logo width={120} height={120} />
				<View className="h-10 w-full">
					<Progress value={progress} />
				</View>
			</VStack>
		</View>
	);
};
