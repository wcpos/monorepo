import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgBasket(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path d="M3.742 20.555q0 0 0 0C4.942 22 7.174 22 11.64 22h.72c4.466 0 6.699 0 7.899-1.445m-16.517 0c-1.2-1.446-.788-3.64.035-8.03.585-3.12.877-4.681 1.988-5.603M20.26 20.555q0 0 0 0c1.2-1.446.788-3.64-.035-8.03-.585-3.12-.878-4.681-1.989-5.603m0 0q0 0 0 0C17.125 6 15.536 6 12.361 6h-.722c-3.175 0-4.763 0-5.874.922q0 0 0 0M9 6V5a3 3 0 1 1 6 0v1" />
			</G>
		</Svg>
	);
}
