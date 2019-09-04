import React from 'react';
import { ActivityIndicator, Animated, View, StyleSheet } from 'react-native';
import Icon from '../icon';
import { Container, InnerContainer, Wrapper, Text } from './styles';

export interface Props {
	content: string;
	duration?: number;
	onClose?: () => void;
	mask?: boolean;
	type?: string;
	onAnimationEnd?: () => void;
}

export default class ToastContainer extends React.Component<Props, any> {
	static defaultProps = {
		duration: 3,
		mask: false,
		onClose() {},
	};

	anim: Animated.CompositeAnimation | null;

	constructor(props: Props) {
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
			<Container pointerEvents={mask ? undefined : 'box-none'}>
				<InnerContainer>
					<Animated.View style={{ opacity: this.state.fadeAnim }}>
						<Wrapper>
							<Text>{content}</Text>
						</Wrapper>
					</Animated.View>
				</InnerContainer>
			</Container>
		);
	}
}
