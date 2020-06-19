import React from 'react';
import { Animated, View, StyleSheet, Easing, ViewStyle, Platform } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import * as Styled from './styles';
import Text from '../text';
import Icon from '../icon';
import Button from '../button';
import useTheme from '../../hooks/use-theme';

export interface Props {
	children: string;
	closable?: boolean;
	disabled?: boolean;
	onClose?: () => void;
}

export interface SkeletonProps {
	backgroundColor: string;
	highlightColor: string;
	speed: number;
	style?: ViewStyle;
}

const Skeleton: React.FC<SkeletonProps> = ({
	backgroundColor = '#E1E9EE',
	highlightColor = '#F2F8FC',
	speed = 800,
	style = { width: '50px', height: '24px', borderRadius: '10px' },
}) => {
	const animatedValue = new Animated.Value(0);

	React.useEffect(() => {
		Animated.loop(
			Animated.timing(animatedValue, {
				toValue: 1,
				duration: speed,
				easing: Easing.ease,
				useNativeDriver: Platform.OS !== 'web',
			})
		).start();
	});

	const translateX = animatedValue.interpolate({
		inputRange: [0, 1],
		outputRange: [-350, 350],
	});

	return (
		<View style={{ position: 'relative' }}>
			<View style={[style, { backgroundColor, overflow: 'hidden' }]}>
				<Animated.View
					style={[
						StyleSheet.absoluteFill,
						{
							transform: [{ translateX }],
						},
					]}
				>
					<LinearGradient
						colors={[backgroundColor, highlightColor, backgroundColor] as string[]}
						start={{ x: 0, y: 0 }}
						end={{ x: 1, y: 0 }}
						style={{ flex: 1 }}
					/>
				</Animated.View>
			</View>
		</View>
	);
};

const Tag: React.FC<Props> = ({ children, closable, disabled, onClose }) => {
	const { theme } = useTheme();
	return (
		<Styled.Tag disabled={disabled}>
			<Text size="small" style={{ color: theme.TAG_TEXT_COLOR }}>
				{children}
			</Text>
			{closable && (
				<Button disabled={disabled} onPress={onClose}>
					<Icon name="close" />
				</Button>
			)}
		</Styled.Tag>
	);
};

export default Object.assign(Tag, { Skeleton });
