import * as React from 'react';
import { NativeSyntheticEvent, Platform, Text, TextLayoutEventData, TextProps } from 'react-native';

export interface MinFontSizeProps extends TextProps {
	children: React.ReactNode;
	fontSize: number;
	minFontSize: number;
}

export const MinFontSize = (props: MinFontSizeProps) => {
	const { fontSize, children, style, numberOfLines, minFontSize, ...rest } = props;

	const [currentFont, setCurrentFont] = React.useState(fontSize);

	const handleResizing = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
		const { lines } = e.nativeEvent;
		if (
			lines.length > (numberOfLines as number) &&
			(currentFont as number) > (minFontSize as number)
		) {
			setCurrentFont((currentFont as number) - 1);
		}
	};

	const handleNumberOfLines = () => {
		if ((Platform.OS === 'ios' && currentFont === minFontSize) || Platform.OS === 'android') {
			return numberOfLines;
		}
	};

	return (
		<Text
			testID="min-font-size"
			numberOfLines={handleNumberOfLines()}
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
