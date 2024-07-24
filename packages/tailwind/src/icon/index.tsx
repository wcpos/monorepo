import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import { cssInterop } from 'nativewind';

import * as Svgs from './components/fontawesome/solid';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

import type { SvgProps } from 'react-native-svg';

export type IconName = Extract<keyof typeof Svgs, string>;

/**
 *
 */
export interface IconProps {
	/** Icon key. */
	name: IconName;
}

/**
 *
 */
export const Icon = ({ name, className }: IconProps) => {
	// const textClass = React.useContext(TextClassContext);

	const SvgIcon = React.useMemo(() => {
		const Svg = get(Svgs, name, Svgs.circleExclamation) as React.FC<SvgProps>;

		return cssInterop(Svg, {
			className: {
				target: 'style',
				nativeStyleToProp: { width: true, height: true, fill: true },
			},
		});
	}, [name]);

	return (
		<View className="inset-0 items-center content-center">
			<SvgIcon className={cn('h-3.5 w-3.5 fill-current', className)} />
		</View>
	);
};
