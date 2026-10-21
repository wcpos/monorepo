import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgSun(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<Path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				d="M17 12a5 5 0 1 1-10.001 0 5 5 0 0 1 10 0m-4.874-8.75H12m.124 17.5H12m8.751-8.625V12m-17.5.125V12m15.025-6.099-.088-.088M5.9 18.275l-.089-.088m12.287.089.088-.089M5.724 5.901l.089-.088M12.25 3.25a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0m0 17.5a.25.25 0 1 1-.5 0 .25.25 0 0 1 .5 0m8.5-8.5a.25.25 0 1 1 0-.5.25.25 0 0 1 0 .5m-17.5 0a.25.25 0 1 1 0-.5.25.25 0 0 1 0 .5m15.114-6.26a.25.25 0 1 1-.354-.354.25.25 0 0 1 .354.353M5.989 18.362a.25.25 0 1 1-.354-.353.25.25 0 0 1 .354.353m12.021.001a.25.25 0 1 1 .354-.354.25.25 0 0 1-.354.354M5.636 5.99a.25.25 0 1 1 .353-.354.25.25 0 0 1-.353.354"
			/>
		</Svg>
	);
}
