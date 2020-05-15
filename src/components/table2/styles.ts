import styled from 'styled-components/native';
import { ThemeProps } from '../../lib/theme/types';
import isNil from 'lodash/isNil';

export const TableWrapper = styled.View``;

export const Row = styled.View`
	flex-direction: row;
	border-bottom-width: 1px;
	border-style: solid;
	border-bottom-color: #000000;
`;

export const Cell = styled.View<{ flexGrow?: 0 | 1; flexShrink?: 0 | 1; width?: string }>`
	flex-grow: ${(props) => (isNil(props.flexGrow) ? 1 : props.flexGrow)};
	flex-shrink: ${(props) => (isNil(props.flexShrink) ? 1 : props.flexShrink)};
	width: ${(props) => (isNil(props.width) ? '100%' : props.width)};
	padding: 5px;
`;

export const HeaderRow = styled.View`
	flex-direction: row;
	border-bottom-width: 2px;
	border-style: solid;
	border-bottom-color: #000000;
`;

export const HeaderCell = styled.View<{
	flexGrow?: 0 | 1;
	flexShrink?: 0 | 1;
	width?: string;
}>`
	flex-direction: row;
	flex-grow: ${(props) => (isNil(props.flexGrow) ? 1 : props.flexGrow)};
	flex-shrink: ${(props) => (isNil(props.flexShrink) ? 1 : props.flexShrink)};
	width: ${(props) => (isNil(props.width) ? '100%' : props.width)};
	padding: 5px;
`;
