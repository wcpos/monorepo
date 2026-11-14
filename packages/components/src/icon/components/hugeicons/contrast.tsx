import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgContrast(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Circle cx={12} cy={12} r={10} strokeLinejoin="round" />
				<Path strokeLinejoin="round" d="M12 22V2" />
				<Path d="M12 7h8.5M12 17h8.5M12 12h10" />
			</G>
		</Svg>
	);
}
