// apps/main/app/(auth)/_layout.tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="connect" />
			<Stack.Screen
				name="login"
				options={{
					presentation: 'modal',
					headerShown: false,
				}}
			/>
		</Stack>
	);
}
