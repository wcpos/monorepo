import styled from 'styled-components/native';

export const Row = styled.View`
	flex-direction: row;
	border-bottom-width: 1px;
	border-style: solid;
	border-bottom-color: #000000;
`;

export const Cell = styled.View`
	padding: 5px;
	align-items: flex-start;
`;

export const HeaderRow = styled.View`
	flex-direction: row;
	border-bottom-width: 2px;
	border-style: solid;
	border-bottom-color: #000000;
	background-color: #ffffff;
`;

export const HeaderCell = styled.View`
	padding: 5px;
`;

export const HeaderTextWrapper = styled.View`
	flex-direction: row;
	align-items: center;
`;
