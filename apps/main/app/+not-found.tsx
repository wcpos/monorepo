import { View } from 'react-native';

import { Link, Stack, useLocalSearchParams } from 'expo-router';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

export default function NotFoundScreen() {
	const { path } = useLocalSearchParams<{ path?: string }>();
	console.log('Attempted route:', path);

	return (
		<>
			<Stack.Screen options={{ title: 'Oops!' }} />
			<View>
				<VStack>
					<Text>This screen doesn't exist.</Text>

					<Link href="/">
						<Text>Go to home screen!</Text>
					</Link>
				</VStack>
			</View>
		</>
	);
}
