import styled, { css } from 'styled-components/native';

type BoxProps = import('./box').BoxProps;

export const Box = styled.View<BoxProps>`
	padding-top: ${({ theme, paddingTop, paddingY, padding }) =>
		`${theme.spacing[paddingTop || paddingY || padding || 'none']}px`};
	padding-bottom: ${({ theme, paddingBottom, paddingY, padding }) =>
		`${theme.spacing[paddingBottom || paddingY || padding || 'none']}px`};
	padding-left: ${({ theme, paddingLeft, paddingX, padding }) =>
		`${theme.spacing[paddingLeft || paddingX || padding || 'none']}px`};
	padding-right: ${({ theme, paddingRight, paddingX, padding }) =>
		`${theme.spacing[paddingRight || paddingX || padding || 'none']}px`};

	flex-grow: ${({ fill }) => (fill ? 1 : 0)};

	flex-direction: ${({ reverse, horizontal }) =>
		reverse ? (horizontal ? 'row-reverse' : 'column-reverse') : horizontal ? 'row' : 'column'};

	justify-content: ${({ distribution }) =>
		distribution === 'start'
			? 'flex-start'
			: distribution === 'end'
			? 'flex-end'
			: distribution === 'center'
			? 'center'
			: 'space-between'};

	align-items: ${({ align }) =>
		align === 'fill'
			? 'stretch'
			: align === 'start'
			? 'flex-start'
			: align === 'end'
			? 'flex-end'
			: 'center'};

	${({ raised }) =>
		raised &&
		css`
			shadow-offset: { width: 0, height: 1 };
			shadow-opacity: 0.22;
			shadow-radius: 7.5px;
			shadow-color: ${({ theme }) => theme.PAGE_BACKGROUND_COLOR};
			elevation: 5;
		`};

	border-top-left-radius: ${({ theme, roundingTopLeft, rounding }) =>
		`${theme.rounding[roundingTopLeft || rounding || 'none']}px`};
	border-top-right-radius: ${({ theme, roundingTopRight, rounding }) =>
		`${theme.rounding[roundingTopRight || rounding || 'none']}px`};
	border-bottom-right-radius: ${({ theme, roundingBottomRight, rounding }) =>
		`${theme.rounding[roundingBottomRight || rounding || 'none']}px`};
	border-bottom-left-radius: ${({ theme, roundingBottomLeft, rounding }) =>
		`${theme.rounding[roundingBottomLeft || rounding || 'none']}px`};

	border-width: ${({ border }) => (border ? '1px' : 0)};
	border-color: ${({ theme }) => theme.colors.primary};
	border-style: solid;
`;
