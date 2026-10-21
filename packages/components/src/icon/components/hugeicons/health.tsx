import * as React from 'react';

import Svg, { G, Path } from 'react-native-svg';

import type { SvgProps } from 'react-native-svg';
export function SvgHealth(props: SvgProps) {
	return (
		<Svg {...props} viewBox="0 0 24 24">
			<G
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
			>
				<Path d="M10.41 19.968C7.59 17.858 2 13.035 2 8.694 2 5.826 4.105 3.5 7 3.5c1.5 0 3 .5 5 2.5 2-2 3.5-2.5 5-2.5 2.895 0 5 2.326 5 5.194 0 4.34-5.59 9.164-8.41 11.274-.95.71-2.23.71-3.18 0" />
				<Path d="M20.001 13h-3.972c-.212 0-.318 0-.41-.036a.5.5 0 0 1-.137-.08c-.075-.063-.122-.154-.217-.335-.273-.521-.41-.782-.605-.844a.52.52 0 0 0-.318 0c-.196.062-.332.323-.605.844l-.62 1.185c-.473.903-.71 1.355-1.046 1.328-.338-.026-.493-.51-.804-1.475l-.465-1.442c-.335-1.042-.503-1.563-.852-1.581-.348-.018-.573.483-1.023 1.485l-.166.372c-.126.28-.19.421-.314.5-.126.08-.286.08-.605.08H4" />
			</G>
		</Svg>
	);
}
