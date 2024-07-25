import styled from 'styled-components/native';

import Box, { BoxProps } from '../box';

export const Cell = styled(Box)<BoxProps & { flex: number; width?: number }>`
	flex: ${({ flex, width }) => (width ? `0 0 ${width}px` : flex)};
`;

export const Row = styled(Box)<BoxProps>`
	border-bottom-width: 1px;
`;

export const HeaderRow = styled(Box)<BoxProps>`
	border-bottom-width: 1px;
	background-color: ${({ theme }) => theme.colors.lightGrey};
`;
