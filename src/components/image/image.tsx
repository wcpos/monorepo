import * as React from 'react';
import { View } from 'react-native';
import { ImgResource } from './resource';
import { Img } from './styles';
import Placeholder from '../skeleton';
import ErrorBoundary from '../error';
import Text from '../text';

export interface IImageProps {
	src: string;
	srcSet?: string;
	border?: 'rounded' | 'circular';
	style?: import('react-native').ImageStyle;
	placeholder?: React.ReactNode;
}

const Image = ({ src, srcSet, border, style }: IImageProps) => {
	if (src) {
		ImgResource.read({ src, srcSet });
	}

	return <Img source={{ uri: src }} border={border} style={style} />;
};

export const SuspendedImage = ({
	src,
	srcSet,
	border,
	style,
	placeholder,
	...rest
}: IImageProps) => {
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
					<Placeholder.Item style={style} />
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
				<Image src={src} srcSet={srcSet} border={border} style={style} {...rest} />
			</ErrorBoundary>
		</React.Suspense>
	);
};
