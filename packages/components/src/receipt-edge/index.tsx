import * as React from 'react';

import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import { Platform } from '@wcpos/utils/platform';

/**
 * A torn top edge: a 10 px strip in which each 12 px repeat bites a semicircle of the page colour
 * out of the cart surface the column already paints, so nothing sits behind it and no overlay is
 * needed (the uniwind ratchet refuses an arbitrary px offset).
 */
export function ReceiptEdge({ testID }: { testID?: string }) {
	const page = useCSSVariable('--color-background');
	const fill =
		Platform.isWeb || Platform.isElectron ? 'var(--color-background)' : String(page ?? '');
	const id = `receipt-edge-${React.useId().replace(/:/g, '')}`;
	return (
		<Svg testID={testID} width="100%" height={10} pointerEvents="none" style={{ flexShrink: 0 }}>
			<Defs>
				<Pattern id={id} width={12} height={10} patternUnits="userSpaceOnUse">
					<Path d="M0 0 h12 a6 6 0 0 1 -12 0 Z" fill={fill} />
				</Pattern>
			</Defs>
			<Rect width="100%" height={10} fill={`url(#${id})`} />
		</Svg>
	);
}
