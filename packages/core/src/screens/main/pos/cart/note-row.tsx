import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import type { CurrentOrderRecord } from '../contexts/current-order';

export function NoteRow({ order, onPress }: { order: CurrentOrderRecord; onPress: () => void }) {
	const note = useDocField(order, (value) => value.payload.customer_note);
	if (!note) return null;
	return (
		// Ruled off above: it closes the cart's lines. Inside, the note is the kind of control a
		// line's name is (Paul, 2026-10-29): the `note` glyph says what the text is, and the ghost
		// gives it the product name's hover — a rounded wash hugging the text, the muted label
		// turning to the foreground — with the name field's inset; `sm` is its 36 and the key rank's size.
		<View className="border-border border-t px-3 py-1">
			<Button
				variant="ghost"
				size="sm"
				leftIcon="note"
				testID="cart-note-row"
				onPress={onPress}
				className="-mx-1 max-w-full justify-start px-1"
			>
				<Text numberOfLines={1}>{note}</Text>
			</Button>
		</View>
	);
}
