import styled, { css } from 'styled-components/native';
import Platform from '@wcpos/common/src/lib/platform';

export const View = styled.View<{ hovered: boolean }>`
	height: 100%;
	align-items: center;
	justify-content: center;
	background-color: ${({ hovered }) => (hovered ? '#f5f5f5' : 'transparent')};
	width: 10px;

	${
		Platform.OS !== 'ios' &&
		Platform.OS !== 'android' &&
		css`
			cursor: col-resize;
		`
	}}
`;
