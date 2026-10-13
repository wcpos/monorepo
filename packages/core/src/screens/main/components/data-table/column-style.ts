import type { ViewStyle } from 'react-native';

function getFlexAlign(align: 'left' | 'right' | 'center'): NonNullable<ViewStyle['alignItems']> {
	switch (align) {
		case 'left':
			return 'flex-start';
		case 'right':
			return 'flex-end';
		case 'center':
			return 'center';
		default:
			return 'flex-start';
	}
}

/**
 * A column's cell style from its UI-settings meta: a fixed width holds its basis, anything else
 * shares the row by its flex weight. Header, body and skeleton cells all read it, so they line up.
 */
export function getColumnStyle(meta: any): ViewStyle {
	if (meta?.width) {
		return {
			flexGrow: 0,
			flexShrink: 0,
			flexBasis: meta.width,
			alignItems: getFlexAlign(meta.align || 'left'),
		};
	}
	return {
		flexGrow: meta?.flex ?? 1,
		flexShrink: 0,
		flexBasis: '0%',
		alignItems: getFlexAlign(meta?.align || 'left'),
	};
}
