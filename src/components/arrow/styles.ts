import styled from 'styled-components/native';

export const Container = styled.View`
	width: 8px;
	height: 8px;
`;

export const Left = styled.View`
	border-top-width: 4px;
	border-bottom-width: 4px;
	border-right-width: 4px;
	border-right-color: ${({ theme }) => theme.COLOR_PRIMARY};
	border-top-color: transparent;
	border-bottom-color: transparent;
`;

export const Right = styled.View`
	border-top-width: 4px;
	border-bottom-width: 4px;
	border-left-width: 4px;
	border-left-color: ${({ theme }) => theme.COLOR_PRIMARY};
	border-top-color: transparent;
	border-bottom-color: transparent;
`;

export const Up = styled.View`
	border-left-width: 4px;
	border-right-width: 4px;
	border-bottom-width: 4px;
	border-bottom-color: ${({ theme }) => theme.COLOR_PRIMARY};
	border-left-color: transparent;
	border-right-color: transparent;
`;

export const Down = styled.View`
	border-left-width: 4px;
	border-right-width: 4px;
	border-top-width: 4px;
	border-top-color: ${({ theme }) => theme.COLOR_PRIMARY};
	border-left-color: transparent;
	border-right-color: transparent;
`;
