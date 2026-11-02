import * as React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { connect, getState, subscribe } from './src/client';
export default function App() {
	const state = React.useSyncExternalStore(subscribe, getState);
	const [draft, setDraft] = React.useState<string | null>(null);
	const [error, setError] = React.useState('');
	return (
		<View style={{ flex: 1, padding: 32, paddingTop: 72, gap: 16 }}>
			<Text testID="status" style={{ fontSize: 56, fontWeight: 'bold' }}>
				{state.status}
			</Text>
			<Text testID="job" style={{ fontSize: 20 }}>
				{state.job || 'WCPOS storage spike 2091'}
			</Text>
			<TextInput
				testID="driver-url"
				accessibilityLabel="Driver URL"
				autoCapitalize="none"
				autoCorrect={false}
				value={draft ?? state.url}
				onChangeText={setDraft}
				style={{ minHeight: 48, padding: 12, borderWidth: 1, fontSize: 16 }}
			/>
			<Pressable
				testID="connect"
				accessibilityRole="button"
				onPress={() => {
					try {
						connect(draft ?? state.url);
						setDraft(null);
						setError('');
					} catch (e) {
						setError(String(e));
					}
				}}
				style={({ pressed }) => ({
					minHeight: 48,
					padding: 12,
					borderWidth: 1,
					opacity: pressed ? 0.5 : 1,
				})}
			>
				<Text style={{ fontSize: 20 }}>Connect</Text>
			</Pressable>
			<Text testID="last-event" style={{ fontSize: 16 }}>
				{error || state.event}
			</Text>
		</View>
	);
}
