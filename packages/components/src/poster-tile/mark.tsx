import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { StockPill } from './stock-pill';
import { CIRCLE } from './style';

import type { PosterMark } from './index';

/**
 * A tile's or a thumb's mark: the stock pill, or a glyph (folder, grid, sliders) in a card circle
 * over a picture and bare in a tint. `compact` is the thumb's 20 px circle.
 */ export function Mark({
	mark,
	label,
	testID,
	bare,
	compact,
}: {
	mark: PosterMark;
	label?: string;
	testID?: string;
	/** On a tint a glyph sits in the tint itself, without its circle. */
	bare?: boolean;
	compact?: boolean;
}) {
	if (mark.kind === 'count')
		return <StockPill value={mark.value} low={mark.low} label={label} testID={testID} />;
	if (mark.kind === 'backorder') return <StockPill backorder label={label} testID={testID} />;
	return (
		<View
			className={bare ? undefined : cn(CIRCLE, compact && 'size-5')}
			accessibilityLabel={label}
			testID={testID}
		>
			<Icon
				name={mark.kind === 'folder' ? 'folder' : mark.name}
				size={bare ? 'lg' : compact ? 'xs' : 'sm'}
				className="text-muted-foreground"
			/>
		</View>
	);
}
