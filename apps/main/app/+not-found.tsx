import { router, Stack } from 'expo-router';

import { GateScreen } from '@wcpos/components/gate-screen';

export default function NotFoundScreen() {
	return (
		<>
			<Stack.Screen options={{ title: 'Oops!' }} />
			<GateScreen
				tone="muted"
				icon="help"
				testID="not-found-screen"
				title="This screen doesn't exist."
				description="The address may be out of date."
				primary={{ label: 'Go to the register', onPress: () => router.replace('/') }}
			/>
		</>
	);
}
