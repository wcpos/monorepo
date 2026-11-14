import { View } from 'react-native';

import { cn } from './utils';

/**
 * The one way a control drawn under 44 pt still gives the finger 44 (CODING_STANDARDS § Design
 * 2; Apple HIG 44 × 44 pt): a transparent band the control token tall, centred over the control
 * and overflowing it, out of layout. Render it as the LAST child of the press target, so a touch
 * on it is the control's own.
 *
 * Not `hitSlop`: iOS (Fabric) hit-tests nothing outside a parent that no child overflows, so slop
 * past a shorter row never reached the control, and React Native Web ignores `hitSlop`
 * altogether. A real overflowing child is hit-tested on iOS and Android and is part of the
 * control's DOM on the web, so this is one answer on every platform.
 *
 * Tall only by default: sideways growth would take a neighbour's touches in a dense strip.
 * `square` grows it to 44 × 44 as well, for a lone control drawn as a small glyph (a checkbox, a
 * radio) that has no neighbour within reach.
 */
export function MinTargetBand({ square = false }: { square?: boolean }) {
	return (
		<View
			testID="min-target-band"
			pointerEvents="box-none"
			className="absolute inset-0 items-center justify-center"
		>
			<View className={cn('min-h-ctl', square ? 'min-w-ctl' : 'w-full')} />
		</View>
	);
}
