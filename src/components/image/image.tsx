import React from 'react';
import { Animated, Platform, ImageSourcePropType } from 'react-native';
import Loader from '../loader';
import { Wrapper, Img, Placeholder } from './styles';

export type Props = {
	style?: any;
	source: ImageSourcePropType;
	border?: 'rounded' | 'circular';
	src: string;
};

const Image = ({ src, ...props }: Props) => {
	const placeholderContainerOpacity = new Animated.Value(1);
	const source = props.source || { uri: src };

	const onLoadEnd = () => {
		/* Images finish loading in the same frame for some reason,
        the images will fade in separately with staggerNonce */
		const minimumWait = 100;
		const staggerNonce = 200 * Math.random();

		setTimeout(
			() =>
				Animated.timing(placeholderContainerOpacity, {
					toValue: 0,
					duration: 350,
					useNativeDriver: true,
				}).start(),
			minimumWait + staggerNonce
		);
	};

	return (
		<Wrapper>
			{Platform.select({
				android: (
					<React.Fragment>
						<Placeholder>
							<Loader />
						</Placeholder>
						<Img source={source} {...props} />
					</React.Fragment>
				),
				default: (
					<React.Fragment>
						<Img source={source} {...props} onLoadEnd={onLoadEnd} />
						{/* <Placeholder>
              <Loader />
            </Placeholder> */}
					</React.Fragment>
				),
			})}
		</Wrapper>
	);
};

export default Image;
