import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgReceipt(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path d="M17.625 21a1.693 1.693 0 0 1 2.25 0A.676.676 0 0 0 21 20.495V3.505A.676.676 0 0 0 19.875 3c-.642.57-1.608.57-2.25 0a1.693 1.693 0 0 0-2.25 0c-.642.57-1.608.57-2.25 0a1.693 1.693 0 0 0-2.25 0c-.642.57-1.608.57-2.25 0a1.693 1.693 0 0 0-2.25 0c-.642.57-1.608.57-2.25 0A.676.676 0 0 0 3 3.505v16.99c0 .583.69.893 1.125.505a1.693 1.693 0 0 1 2.25 0c.642.57 1.608.57 2.25 0a1.693 1.693 0 0 1 2.25 0c.642.57 1.608.57 2.25 0a1.693 1.693 0 0 1 2.25 0c.642.57 1.608.57 2.25 0ZM7.5 15.5h9M7.5 12h9M7.5 8.5h9" />
			</G>
		</Svg>
	);
}
