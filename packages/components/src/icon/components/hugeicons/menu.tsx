import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMenu(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M3.891 20.109C5.282 21.5 7.521 21.5 12 21.5c4.478 0 6.718 0 8.109-1.391S21.5 16.479 21.5 12c0-4.478 0-6.718-1.391-8.109S16.479 2.5 12 2.5c-4.478 0-6.718 0-8.109 1.391S2.5 7.521 2.5 12c0 4.478 0 6.718 1.391 8.109M7 8h10M7 12h10M7 16h10"
			/>
		</Svg>
	);
}
