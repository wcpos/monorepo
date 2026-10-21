import * as React from 'react';

import Svg, { Circle, G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgGlobe(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Circle cx={12} cy={10} r={7} />
				<Path d="M4 16.562A10.29 10.29 0 0 0 11.687 20C17.383 20 22 15.383 22 9.687 22 6.633 20.672 3.888 18.562 2" />
				<Path d="M7.275 4.836c.624.69 1.535 2.005 1.656 3.401.132 1.515 1.096 2.747 2.57 2.763.565.007 1.138-.418 1.136-1.005 0-.181-.029-.367-.074-.538a1.14 1.14 0 0 1 .062-.79c.458-.978 1.357-1.24 2.07-1.772.316-.235.605-.484.732-.684.303-.478.607-1.368.57-1.958M18.82 11.587c-.249.725-.792 1.67-2.675 1.689 0 0-2.195 0-2.854 1.241-.486.916-.263 1.901-.053 2.374M12 22v-2M12 22h-2M14 22h-2" />
			</G>
		</Svg>
	);
}
