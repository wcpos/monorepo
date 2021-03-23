import styled, { css } from 'styled-components/native';

type Props = import('@wcpos/common/src/lib/utility-types').Omit<
	import('./image').IImageProps,
	'src'
>;

export const Img = styled.Image<Props>`
	width: 100px;
	height: 100px;

	/** Rounded */
	${(props) => {
		switch (props.border) {
			case 'rounded':
				return css`
					border-radius: 3px;
				`;
			case 'circular':
				return css`
					border-radius: 500px;
				`;
			default:
				return css`
					border-radius: 0px;
				`;
		}
	}}
`;
