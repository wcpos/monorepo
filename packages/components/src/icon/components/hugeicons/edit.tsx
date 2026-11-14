import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgEdit(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth={1.5}>
				<Path d="M16.946 3.173c.587-.587.88-.88 1.206-1.021.469-.203 1-.203 1.469 0 .325.14.619.434 1.206 1.021s.88.881 1.021 1.206c.203.469.203 1 0 1.469-.14.325-.434.619-1.021 1.206l-5.022 5.022c-1.237 1.237-1.855 1.855-2.63 2.222s-1.646.452-3.387.624L9 15l.078-.788c.172-1.741.257-2.612.624-3.387s.985-1.393 2.222-2.63z" />
				<Path
					strokeLinecap="round"
					d="M6 15H3.75a1.75 1.75 0 1 0 0 3.5h9.5a1.75 1.75 0 1 1 0 3.5H11"
				/>
			</G>
		</Svg>
	);
}
