import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMemo(props: SvgProps) {
	return (
		<Svg
			{...props}
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={1.5}
			className="icon icon-tabler icons-tabler-outline icon-tabler-note"
			viewBox="0 0 24 24"
		>
			<Path stroke="none" d="M0 0h24v24H0z" />
			<Path d="m13 20 7-7M13 20v-6a1 1 0 0 1 1-1h6V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
		</Svg>
	);
}
