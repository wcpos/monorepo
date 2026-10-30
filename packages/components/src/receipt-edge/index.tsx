import * as React from 'react';

import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import { Platform } from '@wcpos/utils/platform';

/** A transparent strip above the cart surface: each 12 px repeat draws one semicircle. */
export function ReceiptEdge({ testID }: { testID?: string }) {
	const cart = useCSSVariable('--color-cart');
	const fill = Platform.isWeb || Platform.isElectron ? 'var(--color-cart)' : String(cart ?? '');
	const id = `receipt-edge-${React.useId().replace(/:/g, '')}`;
	return (
		<Svg testID={testID} width="100%" height={10} pointerEvents="none" style={{ flexShrink: 0 }}>
			<Defs>
				<Pattern id={id} width={12} height={10} patternUnits="userSpaceOnUse">
					<Path d="M0 6 a6 6 0 0 1 12 0 V10 H0 Z" fill={fill} />
				</Pattern>
			</Defs>
			<Rect width="100%" height={10} fill={`url(#${id})`} />
		</Svg>
	);
}
