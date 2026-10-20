import * as React from 'react';

import Svg, { G, Path, Rect } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgScan(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path d="M22 14c0 3.771 0 5.657-1.172 6.828S17.771 22 14 22m-4 0c-3.771 0-5.657 0-6.828-1.172S2 17.771 2 14m8-12C6.229 2 4.343 2 3.172 3.172S2 6.229 2 10m12-8c3.771 0 5.657 0 6.828 1.172S22 6.229 22 10M12 18.48V5.54M5.5 18.48V5.54M14.786 18.48V5.54" />
				<Rect width={0.928} height={12.98} x={8.286} y={5.52} rx={0.464} />
				<Rect width={0.928} height={12.98} x={17.572} y={5.5} rx={0.464} />
			</G>
		</Svg>
	);
}
