import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgUndo(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M12 8v4l2.5 2.5" />
				<Path d="m4.338 6.87 1.266-1.266c3.497-3.497 9.196-3.468 12.728.064s3.56 9.23.064 12.728-9.196 3.468-12.728-.064a9.06 9.06 0 0 1-2.584-7.649m1.241-6.358.013 2.546 2.545.012" />
			</G>
		</Svg>
	);
}
