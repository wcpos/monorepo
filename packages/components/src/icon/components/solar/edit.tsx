import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgEdit(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeWidth={1.5}
				d="m14.36 4.079.927-.927a3.932 3.932 0 0 1 5.561 5.561l-.927.927m-5.56-5.561s.115 1.97 1.853 3.707C17.952 9.524 19.92 9.64 19.92 9.64m0 0-8.52 8.521c-.578.577-.867.866-1.185 1.114a6.6 6.6 0 0 1-1.211.749c-.364.173-.751.302-1.526.56l-3.281 1.094-.802.268a1.06 1.06 0 0 1-1.342-1.342l.268-.802 1.094-3.281c.258-.775.387-1.162.56-1.526q.309-.647.749-1.211c.248-.318.537-.607 1.114-1.184l8.521-8.521m-10.162 17.6-1.876-1.877"
			/>
		</Svg>
	);
}
