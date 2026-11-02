import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCurrency(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeWidth={1.5}>
				<Path d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10Z" />
				<Path
					strokeLinecap="round"
					d="M14.71 10.061c-.099-.763-.975-1.995-2.55-1.995-1.829 0-2.599 1.013-2.755 1.52-.244.678-.195 2.071 1.95 2.223 2.68.19 3.754.506 3.618 2.147s-1.631 1.995-2.812 1.957-3.113-.58-3.188-2.04m3-6.875V8.07m0 7.833v1.095"
				/>
			</G>
		</Svg>
	);
}
