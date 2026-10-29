import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { usePointer } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import { PressableSurface } from '@wcpos/components/pressable-surface';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import type { CurrentOrderRecord } from '../contexts/current-order';

/** The colour step and the glyph's fade run on the overlay fade (150) and the app's ease. */
const MOTION = 'web:transition-colors web:duration-overlay-fade';

/**
 * The order note under the totals, quiet at rest: the `note` glyph and the text in the muted
 * foreground, nothing else on the line. Reaching for it (a fine-pointer hover, a keyboard focus)
 * washes the row, steps the text up to the foreground and fades in the edit glyph at the right,
 * which is where the press goes (the order sheet's note field). Variant C of the interactive
 * board, Paul's pick (2026-10-29). Built on the surface, not a Button: a Button centres its icon
 * and label in its own stack and gives the text its label weight, which is what the first cut
 * got wrong.
 */
export function NoteRow({ order, onPress }: { order: CurrentOrderRecord; onPress: () => void }) {
	const note = useDocField(order, (value) => value.payload.customer_note);
	// Hover and focus kept apart: a pointer leaving a row the keyboard holds must not drop it.
	const [hovered, setHovered] = React.useState(false);
	const [focused, setFocused] = React.useState(false);
	// A finger cannot hover: on a coarse pointer the edit glyph is simply there (no hover-only
	// affordances, CODING_STANDARDS § Design); a fine pointer gets it on reaching the row.
	const pointer = usePointer();
	if (!note) return null;
	const reached = hovered || focused;
	const editShown = reached || pointer === 'coarse';
	const tint = reached ? 'text-foreground' : 'text-muted-foreground';
	return (
		// Ruled off above: it closes the cart's lines. The row sits in the foot's gutter (p-2); the
		// buttons row's own padding is the gap under it.
		<View className="border-border border-t px-2 pt-2">
			<PressableSurface
				testID="cart-note-row"
				onPress={onPress}
				onHoverIn={() => setHovered(true)}
				onHoverOut={() => setHovered(false)}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				// Drawn at 36: the finger still gets the 44 the Button gave it (CODING_STANDARDS § Design 2).
				minTarget
				className="min-h-9 flex-row items-center gap-2 rounded-lg px-2"
			>
				<Icon name="note" className={cn(tint, MOTION)} />
				<Text numberOfLines={1} className={cn('min-w-0 flex-1', tint, MOTION)}>
					{note}
				</Text>
				<Icon
					name="edit"
					size="sm"
					className={cn(
						'text-muted-foreground web:transition-opacity web:duration-overlay-fade',
						editShown ? 'opacity-100' : 'opacity-0'
					)}
				/>
			</PressableSurface>
		</View>
	);
}
