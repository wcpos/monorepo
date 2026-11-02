import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgIcons(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M3 6.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0M2.5 21h8l-4-7zM14 3l7 7m-7 0 7-7m-7 11h7v7h-7z"
			/>
		</Svg>
	);
}
