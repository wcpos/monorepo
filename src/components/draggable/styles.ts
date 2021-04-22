import styled, { css } from 'styled-components/native';

export const View = styled.View<{ hovered: boolean }>`
	height: 100%;
	align-items: center;
	justify-content: center;
	cursor: grab;
`;

// ${(hovered) =>
// 	hovered &&
// 	css`
// 		background-color: #f5f5f5;
// 	`};
