import { Pressable, View } from 'react-native';

import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import type { CurrentOrderRecord } from '../../contexts/current-order';

export function NoteRow({ order, onPress }: { order: CurrentOrderRecord; onPress: () => void }) {
	const note = useDocField(order, (value) => value.payload.customer_note);
	if (!note) return null;
	return (
		<View className="border-border border-t">
			<Pressable
				testID="cart-note-row"
				onPress={onPress}
				className="min-h-row active:bg-muted justify-center px-3"
			>
				<Text className="text-muted-foreground text-sm">{note}</Text>
			</Pressable>
		</View>
	);
}
