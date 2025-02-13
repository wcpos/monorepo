import { Redirect, Stack } from 'expo-router';

import { Splash } from '../../components/splash-screen';
import { useSession } from '../../context/session-provider';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(drawer)',
};

export default function AppLayout() {
	const { session, isLoading } = useSession();

	if (isLoading) {
		return <Splash />;
	}

	if (!session) {
		return <Redirect href="/(auth)/connect" />;
	}

	return (
		<Stack>
			<Stack.Screen
				name="(drawer)"
				options={{
					headerShown: false,
				}}
			/>
			<Stack.Screen
				name="(modal)/settings"
				options={{
					presentation: 'modal',
				}}
			/>
		</Stack>
	);
}
