import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCaretRight(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M17.992 20H9.977c-4.97 0-7.456 0-7.913-1.373s1.532-2.868 5.508-5.856l8.016-6.025c2.798-2.103 4.197-3.154 5.304-2.6C22 4.703 22 6.455 22 9.96v6.025c0 1.893 0 2.84-.587 3.428s-1.531.588-3.42.588Z"
			/>
		</Svg>
	);
}
