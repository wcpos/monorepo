import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCashDrawer(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth={1.5}>
				<Path
					strokeLinecap="round"
					d="M2.5 12c0-4.478 0-6.718 1.391-8.109S7.521 2.5 12 2.5c4.478 0 6.718 0 8.109 1.391S21.5 7.521 21.5 12c0 4.478 0 6.718-1.391 8.109S16.479 21.5 12 21.5c-4.478 0-6.718 0-8.109-1.391S2.5 16.479 2.5 12"
				/>
				<Path d="M21.5 13.5h-4.926c-.842 0-1.503.704-1.875 1.447-.403.808-1.21 1.553-2.699 1.553s-2.296-.745-2.7-1.553c-.37-.743-1.032-1.447-1.874-1.447H2.5" />
			</G>
		</Svg>
	);
}
