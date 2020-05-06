import * as React from 'react';
import { Animated } from 'react-native';
import Svg, { Path, G, Defs, Use, Symbol } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface Props {
	animate?: boolean;
}

const Logo: React.FC<Props> = ({ animate }) => {
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
		<Svg viewBox="0 0 1260 1260" width={100} height={100}>
			<Path
				fill="#323A46"
				d="M0,90 q0,-90 90,-90 L1170,0 q90,0 90,90 L1260,900 q0,90 -90,90 L360,990 L0,1260 Z"
			/>
			<G>
				<G fill="#CD2C24">
					<Path d="M0,90 q0,-90 90,-90 L180,0 L180,270 a90,90 0 1,1 -180,0 Z" />
					<Path d="M360,0 L540,0 L540,270 a90,90 0 1,1 -180,0 Z" />
					<Path d="M720,0 L900,0 L900,270 a90,90 0 1,1 -180,0 Z" />
					<Path d="M1080,0 L1170,0 q90,0 90,90 L1260,270 a90,90 0 1,1 -180,0 Z" />
				</G>
				<G fill="#F5E5C0">
					<Path d="M180,0 L360,0 L360,270 a90,90 0 1,1 -180,0 Z" />
					<Path d="M540,0 L720,0 L720,270 a90,90 0 1,1 -180,0 Z" />
					<Path d="M900,0 L1080,0 L1080,270 a90,90 0 1,1 -180,0 Z" />
				</G>
			</G>
			<Svg
				viewBox="0 0 1200 400"
				width={1060}
				height={1260}
				x={100}
				y={50}
				stroke="#FFF"
				strokeWidth="60"
				strokeLinecap="round"
				fill="#FFF"
				fillOpacity="0"
			>
				<Path d="M30,480 l0,-450m0,150a150,150 0 1,0 300,0a150,150 0 1,0 -300,0" />
				<Path d="M600,30 m-150,150 a150,150 0 1,0 300,0 a150,150 0 1,0 -300,0" />
				<Path d="M1170,70 c-25,-15 -75,-40 -150,-40 q-150,0 -150,75t150,75t150,75 t-150,75 c-75,0 -125,-25 -150,-40" />
			</Svg>
		</Svg>
	);
};

export default Logo;
