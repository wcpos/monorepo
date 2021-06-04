import * as React from 'react';
import { Text, TextProps } from 'react-native';

export interface GroupProps extends TextProps {
	children: React.ReactNode;
}

export const Group = (props: GroupProps) => {
	const [maxSize] = React.useState<number>(1000);

	const { children, style, ...rest } = props;

	return (
		<Text
			testID="group"
			adjustsFontSizeToFit
			numberOfLines={maxSize}
			style={[
				style,
				{
					fontSize: maxSize,
				},
			]}
			{...rest}
		>
			{children}
		</Text>
	);
};
