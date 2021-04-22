import styled from 'styled-components/native';

export const View = styled.View<{ hovered: boolean }>`
	height: 100%;
	align-items: center;
	justify-content: center;
	cursor: grab;
	background-color: ${({ hovered }) => (hovered ? '#f5f5f5' : 'transparent')};
`;
