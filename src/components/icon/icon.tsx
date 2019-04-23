import React from 'react';
import iconsMap from './icons.json';
import Text from '../text';

const sanitizeIconCharacter = (iconCharacter: string) => {
	// if (/^f(.{3})$/.test(iconCharacter)) {
	return String.fromCharCode(parseInt(iconCharacter, 16));
	// }
	// return iconCharacter;
};

type Props = {
	color?: string;
	disabled?: boolean;
	name: string;
	onPress?: () => void;
	raised?: boolean;
	size?: 'small' | 'medium' | 'large';
	style?: {};
};

const Icon = ({ name, color, size, style, onPress }: Props) => {
	// @ts-ignore
	const icon = iconsMap[name] || iconsMap['error'];

	return (
		<Text onPress={onPress} style={{ fontFamily: 'WooCommercePOS', color }}>
			{sanitizeIconCharacter(icon)}
		</Text>
	);
};

export default Icon;

// const getSizeStyle = (size: number): $Values<PlatformStyleObjectType> => ({
//   fontSize: size,
//   width: size,
//   height: size,
//   lineHeight: size,
// });

// const styles = StyleSheet.create({
//   icon: {
//     fontFamily: 'orbit-icons',
//     android: {
//       includeFontPadding: false,
//       textAlignVertical: 'center',
//     },
//   },
//   /* eslint-disable react-native/no-unused-styles */
//   small: getSizeStyle(parseFloat(defaultTokens.widthIconSmall)),
//   medium: getSizeStyle(parseFloat(defaultTokens.widthIconMedium)),
//   large: getSizeStyle(parseFloat(defaultTokens.widthIconLarge)),
//   /* eslint-enable */
// });
