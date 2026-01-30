import { View } from 'react-native';

import { Link, Stack } from 'expo-router';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

export default function NotFoundScreen() {
	return (
		<>
			<Stack.Screen options={{ title: 'Oops!' }} />
			<View>
				<VStack>
					<Text>{"This screen doesn't exist."}</Text>

					<Link href="/">
						<Text>Go to home screen!</Text>
					</Link>
				</VStack>
			</View>
		</>
	);
}
