import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgHealth(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path d="M18 12h-.801c-.83 0-1.245 0-1.589.195-.344.194-.557.55-.984 1.261l-.03.052c-.398.663-.597.994-.886.989s-.476-.344-.849-1.022l-1.687-3.067c-.347-.632-.52-.948-.798-.963-.277-.015-.484.28-.897.87l-.283.405c-.44.627-.659.94-.984 1.11-.326.17-.709.17-1.474.17H6" />
				<Path
					strokeLinejoin="round"
					d="M2 9.26c0 3.748 4.02 7.711 6.962 10.11C10.294 20.458 10.96 21 12 21s1.706-.543 3.038-1.63C17.981 16.972 22 13.009 22 9.26 22 3.35 16.5.663 12 5.5 7.5.663 2 3.349 2 9.26"
				/>
			</G>
		</Svg>
	);
}
