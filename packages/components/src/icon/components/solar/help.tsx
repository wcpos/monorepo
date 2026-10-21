import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgHelp(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Circle cx={12} cy={12} r={10} />
				<Circle cx={12} cy={12} r={4} />
				<Path d="m14.828 9.172 4.244-4.244M4.928 19.072l4.244-4.243M9.172 9.172 4.929 4.928M19.072 19.072l-4.244-4.243" />
			</G>
		</Svg>
	);
}
