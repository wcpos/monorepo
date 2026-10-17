import { ListRow } from '@wcpos/components/list-row';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import type { CurrentOrderRecord } from '../contexts/current-order';

export function NoteRow({ order, onPress }: { order: CurrentOrderRecord; onPress: () => void }) {
	const note = useDocField(order, (value) => value.payload.customer_note);
	if (!note) return null;
	return (
		// Ruled off above: it closes the cart's lines.
		<ListRow testID="cart-note-row" size="sm" onPress={onPress} className="border-t border-b-0">
			<Text className="text-muted-foreground text-sm">{note}</Text>
		</ListRow>
	);
}
