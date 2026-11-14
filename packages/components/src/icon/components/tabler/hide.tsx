import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgHide(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" />
				<Path d="M16.681 16.673A8.7 8.7 0 0 1 12 18q-5.4 0-9-6 1.908-3.18 4.32-4.674m2.86-1.146A9 9 0 0 1 12 6q5.4 0 9 6-1 1.665-2.138 2.87M3 3l18 18" />
			</G>
		</Svg>
	);
}
