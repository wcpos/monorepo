import * as React from 'react';

import Svg, { Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgMemo(props: SvgProps) {
	return (
		<Svg viewBox="0 0 384 512" {...props}>
			<Path d="M0 64C0 28.7 28.7 0 64 0h256c35.3 0 64 28.7 64 64v384c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64zm64 80c0 8.8 7.2 16 16 16h224c8.8 0 16-7.2 16-16s-7.2-16-16-16H80c-8.8 0-16 7.2-16 16m16 80c-8.8 0-16 7.2-16 16s7.2 16 16 16h224c8.8 0 16-7.2 16-16s-7.2-16-16-16zm0 96c-8.8 0-16 7.2-16 16s7.2 16 16 16h128c8.8 0 16-7.2 16-16s-7.2-16-16-16z" />
		</Svg>
	);
}
