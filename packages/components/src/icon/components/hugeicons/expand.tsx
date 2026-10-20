import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgExpand(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeMiterlimit={16}
				strokeWidth={1.5}
				d="M19 12V9c0-1.886 0-2.828-.586-3.414S16.886 5 15 5h-3m-7 7v3c0 1.886 0 2.828.586 3.414S7.114 19 9 19h3"
			/>
		</Svg>
	);
}
