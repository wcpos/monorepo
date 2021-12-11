import styled, { css } from 'styled-components/native';

type BoxProps = import('./box').BoxProps;

export const Box = styled.View<BoxProps>`
	padding-top: ${({ theme, paddingTop, paddingY, padding }) =>
		`${theme.spacing[paddingTop || paddingY || padding || 'none']}px`};
	padding-bottom: ${({ theme, paddingTop, paddingY, padding }) =>
		`${theme.spacing[paddingTop || paddingY || padding || 'none']}px`};
	padding-left: ${({ theme, paddingTop, paddingY, padding }) =>
		`${theme.spacing[paddingTop || paddingY || padding || 'none']}px`};
	padding-right: ${({ theme, paddingTop, paddingY, padding }) =>
		`${theme.spacing[paddingTop || paddingY || padding || 'none']}px`};

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
`;
