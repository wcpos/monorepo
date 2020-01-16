import styled, { css } from 'styled-components/native';

type ThemeProps = import('../../lib/theme/types').ThemeProps;
type Props = import('../../lib/utility-types').Omit<import('./image').Props, 'src'>;

export const Img = styled.Image<{ theme: ThemeProps } & Props>`
	width: 100px;
	height: 100px;

	/** Rounded */
	${props => {
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
