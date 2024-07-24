import styled from 'styled-components/native';

import Box, { BoxProps } from '../box';

// export const Table = styled.View`
// 	width: 677px;
// 	height: 700px;
// `;

export const Table = styled.View`
	width: 100%;
	height: 100%;
`;

export const Row = styled(Box)<BoxProps & { alt: boolean }>`
	border-bottom-width: 0px;
	border-style: solid;
	border-bottom-color: ${({ theme }) => theme.colors.lightGrey};
	background-color: ${({ alt, theme }) => (alt ? theme.colors.lightestGrey : 'transparent')};
`;

export const Cell = styled(Box)<BoxProps & { flex: number; width: number }>`
	flex: ${({ flex, width }) => (width ? `0 0 ${width}px` : flex)};
`;

export const HeaderRow = styled(Box)`
	border-bottom-width: 1px;
	border-style: solid;
	border-bottom-color: ${({ theme }) => theme.colors.grey};
	background-color: ${({ theme }) => theme.colors.lightGrey};
`;

export const HeaderCell = styled(Box)<BoxProps & { flex: number; width: number }>`
	flex: ${({ flex, width }) => (width ? `0 0 ${width}px` : flex)};
`;

export const HeaderTextWrapper = styled.View`
	flex-direction: row;
	align-items: center;
`;
