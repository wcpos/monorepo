import * as React from 'react';
import { NativeSyntheticEvent, Text, TextLayoutEventData, TextProps } from 'react-native';

export interface MaxLinesProps extends TextProps {
	children: React.ReactNode;
	fontSize: number;
}

export const MaxLines = (props: MaxLinesProps) => {
	const { fontSize, children, style, numberOfLines, ...rest } = props;

	const [currentFont, setCurrentFont] = React.useState<number>(fontSize as number);

	const handleResizing = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
		const { lines } = e.nativeEvent;
		if (lines.length > (numberOfLines as number)) {
			setCurrentFont(currentFont - 1);
		}
	};

	return (
		<Text
			testID="max-lines"
			numberOfLines={numberOfLines}
			adjustsFontSizeToFit
			style={[
				style,
				{
					fontSize: currentFont,
				},
			]}
			{...rest}
			onTextLayout={handleResizing}
		>
			{children}
		</Text>
	);
};
