import { View } from 'react-native';

import { Stack } from 'expo-router';

import { useNavigationBackground } from '../../../../components/use-navigation-background';

export const unstable_settings = { initialRouteName: '(pages)' };

export default function SettingsStack() {
	const screenBackgroundColor = useNavigationBackground();
	return (
		<View className="bg-background flex-1">
			<Stack
				screenOptions={{
					headerShown: false,
					contentStyle: { backgroundColor: screenBackgroundColor },
				}}
			>
				<Stack.Screen name="(pages)" />
				<Stack.Screen
					name="(modals)/mini-app/[id]"
					options={{
						presentation: 'containedTransparentModal',
						animation: 'fade',
						contentStyle: { backgroundColor: 'transparent' },
					}}
				/>
			</Stack>
		</View>
	);
}
