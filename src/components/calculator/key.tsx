import * as React from 'react';
import {
	StyleSheet,
	Text,
	TouchableHighlight,
	NativeSyntheticEvent,
	NativeTouchEvent,
} from 'react-native';

const calculatorKeyStyles = StyleSheet.create({
	root: {
		width: 80,
		height: 80,
		borderTopWidth: 1,
		borderTopColor: '#777',
		borderTopStyle: 'solid',
		borderRightWidth: 1,
		borderRightColor: '#666',
		borderRightStyle: 'solid',
		outline: 'none',
	},
	text: {
		fontWeight: '100',
		fontFamily: 'Roboto, sans-serif',
		lineHeight: 80,
		textAlign: 'center',
	},
});

interface Props {
	children: any;
	onPress: (event: NativeSyntheticEvent<NativeTouchEvent>) => void;
	style: any;
	textStyle: any;
}

class Key extends React.Component<Props> {
	render() {
		const { children, onPress, style, textStyle } = this.props;

		return (
			<TouchableHighlight
				accessibilityRole="button"
				onPress={onPress}
				style={[calculatorKeyStyles.root, style]}
				underlayColor="rgba(0,0,0,0.25)"
			>
				<Text children={children} style={[calculatorKeyStyles.text, textStyle]} />
			</TouchableHighlight>
		);
	}
}

export default Key;
