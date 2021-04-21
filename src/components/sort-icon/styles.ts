import styled from 'styled-components/native';

export const Container = styled.View``;

export const Up = styled.View<{ active: boolean }>`
	border-left-width: 5px;
	border-right-width: 5px;
	border-bottom-width: 5px;
	border-bottom-color: ${({ active }) => (active ? 'black' : 'transparent')};
	border-left-color: transparent;
	border-right-color: transparent;
	margin-bottom: 2px;
`;

export const Down = styled.View<{ active: boolean }>`
	border-left-width: 5px;
	border-right-width: 5px;
	border-top-width: 5px;
	border-top-color: ${({ active }) => (active ? 'black' : 'transparent')};
	border-left-color: transparent;
	border-right-color: transparent;
`;
