import styled, { css } from 'styled-components/native';

type ThemeProps = import('../../lib/theme/types').ThemeProps;
type Border = Pick<import('./image').Props, 'border'>;

export const Img = styled.Image<{ theme: ThemeProps; border?: Border }>`
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
					border-radius: 500;
				`;
			default:
				return css`
					border-radius: 0;
				`;
		}
	}}
`;
