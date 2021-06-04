import * as React from 'react';
import { NativeSyntheticEvent, Text, TextLayoutEventData, TextProps } from 'react-native';

export interface OverflowReplacementProps extends TextProps {
	children: React.ReactNode;
	fontSize: number;
	overflowReplacement: string;
}

export const OverflowReplacement = (props: OverflowReplacementProps) => {
	const { fontSize, children, style, numberOfLines, overflowReplacement, ...rest } = props;
	const [currentText, setCurrentText] = React.useState<string>('');

	const handleResizing = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
		const { lines } = e.nativeEvent;
		if (lines.length > (numberOfLines as number)) {
			setCurrentText(overflowReplacement as string);
			return;
		}

		setCurrentText(currentText);
	};

	return (
		<Text
			testID="overflow-replacement"
			style={[
				style,
				{
					fontSize,
				},
			]}
			{...rest}
			onTextLayout={handleResizing}
		>
			{currentText || children}
		</Text>
	);
};
