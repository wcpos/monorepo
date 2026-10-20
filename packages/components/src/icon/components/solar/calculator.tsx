import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgCalculator(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path d="M4.318 20.536C5.636 22 7.758 22 12 22s6.364 0 7.682-1.465C21 19.072 21 16.714 21 12s0-7.071-1.318-8.536S16.242 2 12 2 5.636 2 4.318 3.464C3 4.93 3 7.286 3 12s0 7.071 1.318 8.535Z" />
				<Path d="M7 8c0-.465 0-.697.051-.888a1.5 1.5 0 0 1 1.06-1.06C8.304 6 8.536 6 9 6h6c.465 0 .697 0 .888.051a1.5 1.5 0 0 1 1.06 1.06C17 7.304 17 7.536 17 8s0 .697-.051.888a1.5 1.5 0 0 1-1.06 1.06C15.697 10 15.464 10 15 10H9c-.465 0-.697 0-.888-.051a1.5 1.5 0 0 1-1.06-1.06C7 8.696 7 8.464 7 8Z" />
				<Path
					strokeLinejoin="round"
					d="M8 13h.009m3.982 0H12m3.991 0H16M8 17h.009m3.982 0H12m3.991 0H16"
				/>
			</G>
		</Svg>
	);
}
