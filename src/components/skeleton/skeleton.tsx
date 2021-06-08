import * as React from 'react';
import { Animated, View, StyleSheet, Easing, ViewStyle, Platform, StyleProp } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

export interface SkeletonProps {
	/**
	 * Determines component's children.
	 */
	children: JSX.Element | JSX.Element[];
	/**
	 * Determines the color of placeholder. By default is #E1E9EE
	 */
	backgroundColor?: string;
	/**
	 * Determines the highlight color of placeholder. By default is #F2F8FC
	 */
	highlightColor?: string;
	/**
	 * Determines the animation speed in milliseconds. By default is 800
	 */
	speed?: number;
	style?: any;
}

export const Skeleton = ({
	children,
	backgroundColor = '#E1E9EE',
	speed = 800,
	highlightColor = '#F2F8FC',
	style,
}: SkeletonProps) => {
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

	const getChildren = (element: JSX.Element | JSX.Element[]) => {
		return React.Children.map(element, (child: JSX.Element, index: number) => {
			let style;
			if (child.type.displayName === 'SkeletonItem') {
				const { children, ...styles } = child.props;
				style = { ...child.props.style, ...styles };
			} else {
				style = child.props.style;
			}
			if (child.props.children) {
				return (
					<View key={index} style={style}>
						{getChildren(child.props.children)}
					</View>
				);
			}

			return (
				<View key={index} style={[{ position: 'relative' }, style]}>
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
		});
	};

	return <>{getChildren(children)}</>;
};
