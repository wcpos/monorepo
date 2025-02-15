import { Text, View } from 'react-native';

import { Link } from 'expo-router';

import { useAppState } from '@wcpos/core/contexts/app-state';

export default function Index() {
	const { logout } = useAppState();

	return (
		<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
			<Text>Home Screen</Text>
			<Link href="/(app)/(modal)/settings">Present modal</Link>

			<Text
				onPress={() => {
					// The `app/(app)/_layout.tsx` will redirect to the sign-in screen.
					logout();
				}}
			>
				Sign Out
			</Text>
		</View>
	);
}
