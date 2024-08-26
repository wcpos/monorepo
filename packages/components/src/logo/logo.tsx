import * as React from 'react';
import { StyleProp, ViewProps } from 'react-native';

import Svg, { Path, G, Circle, Line, SvgProps } from 'react-native-svg';

interface Props extends SvgProps {
	animate?: boolean;
}

const Logo: React.FC<Props> = ({ animate, width = 100, height = 100, ...props }) => {
	// const scaleY = React.useRef(new Animated.Value(1));

	// const pulse = () => {
	// 	Animated.loop(
	// 		Animated.sequence([
	// 			Animated.timing(scaleY.current, { toValue: 0.7, useNativeDriver: true }),
	// 			Animated.timing(scaleY.current, { toValue: 1, useNativeDriver: true }),
	// 		])
	// 	).start();
	// };

	// React.useEffect(() => {
	// 	if (animate) {
	// 		pulse();
	// 	} else {
	// 		scaleY.current.stopAnimation();
	// 	}
	// }, [animate]);

	return (
		<Svg viewBox="0 0 1260 1260" width={width} height={height} {...props}>
			<Path
				d="m0,90q0,-90 90,-90l1080,0q90,0 90,90l0,810q0,90 -90,90l-810,0l-360,270l0,-1170z"
				fill="#323A46"
			/>
			<G fill="#CD2C24">
				<Path
					d="M0,90 Q0,0 90,0 L180,0 L180,270 A90,90 0 1 1 0,270 Z
            M360,0 H540 V270 A90,90 0 1 1 360,270 Z
            M720,0 H900 V270 A90,90 0 1 1 720,270 Z
            M1080,0 H1170 Q1260,0 1260,90 L1260,270 A90,90 0 1 1 1080,270 Z"
				/>
			</G>
			<G fill="#F5E5C0">
				<Path
					d="M180,0 H360 V270 A90,90 0 1 1 180,270 Z
            M540,0 H720 V270 A90,90 0 1 1 540,270 Z
            M900,0 H1080 V270 A90,90 0 1 1 900,270 Z"
				/>
			</G>
			<Line
				x1="130"
				y1="923.5"
				x2="130"
				y2="532"
				stroke="#FFF"
				strokeLinecap="round"
				strokeWidth="55"
			/>
			<Circle
				cx="260.5"
				cy="662.5"
				r="130.5"
				fill="none"
				stroke="#FFF"
				strokeLinecap="round"
				strokeWidth="55"
			/>
			<Circle
				cx="630"
				cy="662"
				r="131"
				fill="none"
				stroke="#FFF"
				strokeLinecap="round"
				strokeWidth="55"
			/>
			<Path
				d="m1131,565.8c-21.75,-13.05 -65.25,-34.8 -130.5,-34.8q-130.5,0 -130.5,65.25t130.5,65.25t130.5,65.25t-130.5,65.25c-65.25,0 -108.75,-21.75 -130.5,-34.8"
				fill="#FFF"
				fillOpacity="0"
				stroke="#FFF"
				strokeLinecap="round"
				strokeWidth="55"
			/>
		</Svg>
	);
};

export default Logo;
