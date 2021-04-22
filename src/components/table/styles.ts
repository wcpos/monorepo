import styled from 'styled-components/native';
import isNil from 'lodash/isNil';

type ThemeProps = import('../../lib/theme').ThemeProps;

type RowProps = { theme: ThemeProps } & Pick<import('./row').ITableRowProps, 'style'>;

export const Row = styled.View<RowProps>`
	flex-direction: row;
	border-bottom-width: 1px;
	border-style: solid;
	border-bottom-color: #000000;
`;

type CellProps = { theme: ThemeProps } & import('./cell').ITableCellProps;

export const Cell = styled.View<CellProps>`
	flex-grow: ${({ flexGrow }) => (isNil(flexGrow) ? 1 : flexGrow)};
	flex-shrink: ${({ flexShrink }) => (isNil(flexShrink) ? 1 : flexShrink)};
	width: ${({ width }) => (isNil(width) ? '100%' : width)};
	padding: 5px;
	align-items: flex-start;
`;

type HeaderRowProps = { theme: ThemeProps } & Pick<import('./header-row').IHeaderRowProps, 'style'>;

export const HeaderRow = styled.View<HeaderRowProps>`
	flex-direction: row;
	border-bottom-width: 2px;
	border-style: solid;
	border-bottom-color: #000000;
	background-color: #ffffff;
`;

type HeaderCellProps = { theme: ThemeProps } & Omit<
	import('./header-cell').IHeaderCellProps,
	'dataKey'
>;

export const HeaderCell = styled.View<HeaderCellProps>`
	flex-direction: row;
	flex-grow: ${({ flexGrow }) => (isNil(flexGrow) ? 1 : flexGrow)};
	flex-shrink: ${({ flexShrink }) => (isNil(flexShrink) ? 1 : flexShrink)};
	width: ${({ width }) => (isNil(width) ? '100%' : width)};
	padding: 5px;
`;
