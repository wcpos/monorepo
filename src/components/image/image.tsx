import React from 'react';
import { View } from 'react-native';
import { ImgResource } from './resource';
import { Img } from './styles';
import Placeholder from '../placeholder';
import ErrorBoundary from '../error';

export type Props = {
	src: string;
	srcSet?: string;
	border?: 'rounded' | 'circular';
	style?: import('react-native').ImageStyle;
};

const Image = ({ src, srcSet, border, style }: Props) => {
	if (src) {
		ImgResource.read({ src, srcSet });
	}

	return <Img source={{ uri: src }} border={border} style={style} />;
};

const SuspendedImage = (props) => (
	<React.Suspense
		fallback={
			<Placeholder>
				<Placeholder.Item style={props.style} />
			</Placeholder>
		}
	>
		<ErrorBoundary fallback={<View style={{ backgroundColor: '#000', height: 100, width: 100 }} />}>
			<Image {...props} />
		</ErrorBoundary>
	</React.Suspense>
);

export default SuspendedImage;
