import * as React from 'react';
import { ImageSourcePropType } from 'react-native';
import * as Styled from './styles';
import Skeleton from '../skeleton';
import Text from '../text';

export interface ImageProps {
	/**
	 * Image source (simple)
	 */
	src?: string;
	/**
	 * Image source (which is the same as React Native `Image` component).
	 */
	source?: ImageSourcePropType;
	/**
	 * Image border shape
	 */
	border?: 'default' | 'rounded' | 'circular';
	/**
	 * Placeholder to show if image not available / fallback?
	 */
	placeholder?: string | React.ReactNode;
	/**
	 * Style
	 */
	style?: any;
	/**
	 * Width
	 */
	width?: number;
	/**
	 * Height
	 */
	height?: number;
}

export const Image = ({
	src,
	source,
	border = 'default',
	width = 100,
	height = 100,
	style,
}: ImageProps) => {
	const [loaded, setLoaded] = React.useState(false);

	const handleLoad = () => {
		setLoaded(true);
	};

	return (
		<Styled.Container style={[style, { width, height }]}>
			<Styled.Image source={source || { uri: src }} onLoad={handleLoad} border={border} />
			{!loaded && <Skeleton width={width} height={height} />}
		</Styled.Container>
	);
};
