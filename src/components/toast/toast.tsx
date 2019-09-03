import React from 'react';
import { ActivityIndicator, Animated, View, StyleSheet } from 'react-native';
import Icon from '../icon';
import Text from '../text';
// import {} from './styles';

export interface ToastProps {
	content: string;
	duration?: number;
	onClose?: () => void;
	mask?: boolean;
	type?: string;
	onAnimationEnd?: () => void;
}

export default class ToastContainer extends React.Component<ToastProps, any> {
	static defaultProps = {
		duration: 3,
		mask: true,
		onClose() {},
	};

	anim: Animated.CompositeAnimation | null;

	constructor(props: ToastProps) {
		super(props);
		this.state = {
			fadeAnim: new Animated.Value(0),
		};
	}

	componentDidMount() {
		const { onClose, onAnimationEnd } = this.props;
		const duration = this.props.duration as number;
		const timing = Animated.timing;
		if (this.anim) {
			this.anim = null;
		}
		const animArr = [
			timing(this.state.fadeAnim, {
				toValue: 1,
				duration: 200,
				useNativeDriver: true,
			}),
			Animated.delay(duration * 1000),
		];
		if (duration > 0) {
			animArr.push(
				timing(this.state.fadeAnim, {
					toValue: 0,
					duration: 200,
					useNativeDriver: true,
				})
			);
		}
		this.anim = Animated.sequence(animArr);
		this.anim.start(() => {
			if (duration > 0) {
				this.anim = null;
				if (onClose) {
					onClose();
				}
				if (onAnimationEnd) {
					onAnimationEnd();
				}
			}
		});
	}

	componentWillUnmount() {
		if (this.anim) {
			this.anim.stop();
			this.anim = null;
		}
	}

	render() {
		const { type = '', content, mask } = this.props;
		return (
			<View style={[styles.container]} pointerEvents={mask ? undefined : 'box-none'}>
				<View style={[styles.innerContainer]}>
					<Animated.View style={{ opacity: this.state.fadeAnim }}>
						<View style={[styles.innerWrap]}>
							<Text>{content}</Text>
						</View>
					</Animated.View>
				</View>
			</View>
		);
	}
}

const styles = StyleSheet.create({
	container: {
		position: 'absolute',
		top: 0,
		left: 0,
		bottom: 0,
		right: 0,
		backgroundColor: 'transparent',
		justifyContent: 'center',
		alignItems: 'center',
		// zIndex: theme.toast_zindex,
		zIndex: 1000,
	},
	innerContainer: {
		backgroundColor: 'transparent',
	},
	innerWrap: {
		alignItems: 'center',
		// backgroundColor: theme.toast_fill,
		backgroundColor: 'white',
		minWidth: 100,
	},
});
