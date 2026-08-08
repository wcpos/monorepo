import { View } from 'react-native';

import { Stack } from 'expo-router';

import { useUserCapabilities } from '@wcpos/core/screens/main/hooks/use-user-capabilities';

import { useNavigationBackground } from '../../../../components/use-navigation-background';

export const unstable_settings = {
	initialRouteName: 'index',
};

export default function CouponsLayout() {
	const screenBackgroundColor = useNavigationBackground();
	const { caps } = useUserCapabilities();
	return (
		<View className="bg-background flex-1">
			<Stack
				screenOptions={{
					headerShown: false,
					contentStyle: { backgroundColor: screenBackgroundColor },
				}}
			>
				<Stack.Screen name="index" />
				<Stack.Protected guard={caps.canEditCoupons}>
					<Stack.Screen
						name="(modals)/edit/[couponId]"
						options={{
							presentation: 'containedTransparentModal',
							animation: 'fade',
							contentStyle: { backgroundColor: 'transparent' },
						}}
					/>
				</Stack.Protected>
				<Stack.Protected guard={caps.canCreateCoupons}>
					<Stack.Screen
						name="(modals)/add"
						options={{
							presentation: 'containedTransparentModal',
							animation: 'fade',
							contentStyle: { backgroundColor: 'transparent' },
						}}
					/>
				</Stack.Protected>
			</Stack>
		</View>
	);
}
