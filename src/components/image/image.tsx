import * as React from 'react';
import { View } from 'react-native';
import { ImgResource } from './resource';
import { Img } from './styles';
import Placeholder from '../skeleton';
import ErrorBoundary from '../error';
import Text from '../text';

export type Props = {
	src: string;
	srcSet?: string;
	border?: 'rounded' | 'circular';
	style?: import('react-native').ImageStyle;
	placeholder?: string | React.ReactNode;
};

const Image = ({ src, srcSet, border, style }: Props) => {
	if (src) {
		ImgResource.read({ src, srcSet });
	}

	return <Img source={{ uri: src }} border={border} style={style} />;
};

const SuspendedImage = ({ placeholder, ...props }) => {
	const getPlaceholder = () => {
		if (typeof placeholder === 'string') {
			return (
				<Text type="inverse" weight="bold">
					{placeholder}
				</Text>
			);
		}
		return placeholder;
	};

	return (
		<React.Suspense
			fallback={
				<Placeholder>
					<Placeholder.Item style={props.style} />
				</Placeholder>
			}
		>
			<ErrorBoundary
				fallback={
					<View
						style={{
							backgroundColor: '#000',
							height: 100,
							width: 100,
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						{getPlaceholder()}
					</View>
				}
			>
				<Image {...props} />
			</ErrorBoundary>
		</React.Suspense>
	);
};

export default SuspendedImage;
