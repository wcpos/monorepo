import React from 'react';
import { Animated, Platform, ImageSourcePropType } from 'react-native';
import Loader from '../loader';
import { Wrapper, Img, Placeholder } from './styles';

export type Props = {
	style?: any;
	source: ImageSourcePropType;
	border?: 'rounded' | 'circular';
};

const Image = (props: Props) => {
	const placeholderContainerOpacity = new Animated.Value(1);

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
						<Img {...props} />
					</React.Fragment>
				),
				default: (
					<React.Fragment>
						<Img {...props} onLoadEnd={onLoadEnd} />
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
