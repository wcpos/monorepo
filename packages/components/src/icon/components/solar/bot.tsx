import * as React from 'react';

import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgBot(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round">
				<Path
					strokeWidth={1.5}
					d="M19.946 12.573c.575.06.993.169 1.322.366.732.44.732 1.146.732 2.56s0 2.122-.732 2.561c-.329.198-.747.306-1.322.366M4.054 18.426c-.574-.06-.993-.168-1.322-.366C2 17.621 2 16.914 2 15.5s0-2.122.732-2.56c.329-.198.748-.307 1.322-.367"
				/>
				<Path
					strokeWidth={1.5}
					d="M4 15.5c0-1.187 0-2.144.054-2.927.087-1.237.31-2.038.883-2.621C5.875 9 7.383 9 10.4 9h3.2c3.017 0 4.525 0 5.463.952.574.583.796 1.384.883 2.621.054.783.054 1.74.054 2.927s0 2.144-.055 2.927c-.086 1.237-.308 2.038-.882 2.621C18.126 22 16.617 22 13.6 22h-3.2c-3.017 0-4.525 0-5.463-.952-.574-.583-.796-1.384-.883-2.621C4 17.644 4 16.687 4 15.5Z"
				/>
				<Circle cx={12} cy={3.5} r={1.5} strokeWidth={1.5} />
				<Path strokeWidth={1.5} d="M12 5v4M9 18c.85.63 1.885 1 3 1s2.15-.37 3-1" />
				<Path d="M15.5 13.5c0 .552-.224 1-.5 1s-.5-.448-.5-1 .224-1 .5-1 .5.448.5 1Z" />
				<Ellipse cx={9} cy={13.5} rx={0.5} ry={1} />
			</G>
		</Svg>
	);
}
