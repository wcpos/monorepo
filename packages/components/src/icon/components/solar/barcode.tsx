import * as React from 'react';

import Svg, { G, Path, Rect } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgBarcode(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5}>
				<Path d="M12.317 18.979v-14M5.54 18.979v-14M15.222 18.979v-14M22 18.978v-14M2.634 18.979v-14" />
				<Rect width={0.968} height={14.043} x={8.444} y={4.957} rx={0.484} />
				<Rect width={0.968} height={14.043} x={18.127} y={4.935} rx={0.484} />
			</G>
		</Svg>
	);
}
