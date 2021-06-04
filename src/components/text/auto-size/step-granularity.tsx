import * as React from 'react';
import { NativeSyntheticEvent, Platform, Text, TextLayoutEventData, TextProps } from 'react-native';

export interface StepGranularityProps extends TextProps {
	children: React.ReactNode;
	fontSize: number;
	granularity: number;
}

export const StepGranularity = (props: StepGranularityProps) => {
	const { fontSize, children, style, numberOfLines, granularity, ...rest } = props;
	const [currentFont, setCurrentFont] = React.useState(fontSize);
	const handleResizing = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
		const { lines } = e.nativeEvent;
		if (lines.length > (numberOfLines as number)) {
			setCurrentFont((currentFont as number) - (granularity as number));
		}
	};

	const handleNumberOfLines = () => {
		if (Platform.OS === 'android') {
			return numberOfLines;
		}
	};

	return (
		<Text
			testID="step-granularity"
			numberOfLines={handleNumberOfLines()}
			style={[
				style,
				{
					fontSize: currentFont,
				},
			]}
			onTextLayout={handleResizing}
			{...rest}
		>
			{children}
		</Text>
	);
};
