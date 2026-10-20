import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgRefresh(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M3.68 13v-1.667C3.68 6.731 7.44 3 12.079 3a8.41 8.41 0 0 1 7.176 4M2 11.333 3.68 13l1.68-1.667M20.314 11v1.667c0 4.602-3.775 8.333-8.431 8.333a8.45 8.45 0 0 1-7.203-4M22 12.667 20.314 11l-1.686 1.667" />
			</G>
		</Svg>
	);
}
