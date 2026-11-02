import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgHide(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path
					strokeLinejoin="round"
					d="M6.434 6.52C4.22 7.89 2.933 9.865 2.319 11.034c-.213.404-.319.606-.319.974s.106.57.318.973c1.01 1.926 3.849 6.039 9.649 6.039 2.278 0 4.1-.635 5.533-1.523"
				/>
				<Path d="M9.879 9.879a3 3 0 1 0 4.243 4.243" />
				<Path
					strokeLinejoin="round"
					d="m2 2 20 20M10 5.148A12 12 0 0 1 11.894 5c5.88 0 8.759 4.054 9.784 5.952.215.397.322.596.322.959 0 .362-.108.562-.323.96A12.4 12.4 0 0 1 20.217 15"
				/>
			</G>
		</Svg>
	);
}
