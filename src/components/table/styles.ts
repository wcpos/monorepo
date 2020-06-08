import styled from 'styled-components/native';
import isNil from 'lodash/isNil';

type ThemeProps = import('../../lib/theme/types').ThemeProps;

type RowProps = { theme: ThemeProps } & import('./row').Props;

export const Row = styled.View<RowProps>`
	flex-direction: row;
	border-bottom-width: 1px;
	border-style: solid;
	border-bottom-color: #000000;
`;

type CellProps = { theme: ThemeProps } & import('./cell').Props;

export const Cell = styled.View<CellProps>`
	flex-grow: ${({ flexGrow }) => (isNil(flexGrow) ? 1 : flexGrow)};
	flex-shrink: ${({ flexShrink }) => (isNil(flexShrink) ? 1 : flexShrink)};
	width: ${({ width }) => (isNil(width) ? '100%' : width)};
	padding: 5px;
`;

type HeaderRowProps = { theme: ThemeProps } & import('./header-row').Props;

export const HeaderRow = styled.View<HeaderRowProps>`
	flex-direction: row;
	border-bottom-width: 2px;
	border-style: solid;
	border-bottom-color: #000000;
`;

type HeaderCellProps = { theme: ThemeProps } & import('./header-cell').Props;

export const HeaderCell = styled.View<HeaderCellProps>`
	flex-direction: row;
	flex-grow: ${({ flexGrow }) => (isNil(flexGrow) ? 1 : flexGrow)};
	flex-shrink: ${({ flexShrink }) => (isNil(flexShrink) ? 1 : flexShrink)};
	width: ${({ width }) => (isNil(width) ? '100%' : width)};
	padding: 5px;
`;
