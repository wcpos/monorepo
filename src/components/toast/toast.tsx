import * as React from 'react';
import { animated, useSpring } from 'react-spring/native';
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

const Toast = ({ content, duration, onClose, mask, type, onAnimationEnd }: Props) => {
	// const fade = useSpring({ opacity: 1, from: { opacity: 0 }, config: { duration: 250 } });
	const fade = useSpring({
		to: [{ opacity: 1 }, { opacity: 0 }],
		from: { opacity: 0 },
		onRest: onAnimationEnd,
	});
	const AnimatedWrapper = animated(Wrapper);

	return (
		<Container pointerEvents={mask ? undefined : 'box-none'}>
			<InnerContainer>
				<AnimatedWrapper style={fade}>
					<Text>{content}</Text>
				</AnimatedWrapper>
			</InnerContainer>
		</Container>
	);
};

export default Toast;
