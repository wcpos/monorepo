import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgHide(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth={1.5}
				d="M12 14C5 14 2 7 2 7m20 0s-.941 2.197-3 4.129c-.913.857-2.045 1.661-3.413 2.2A9.7 9.7 0 0 1 12 14m0 0v2.5m3.587-3.171L17 15.5m2-4.371 1.5 1.5m-12.087.7L7 15.5m-2-4.371-1.5 1.5"
			/>
		</Svg>
	);
}
