import styled, { css } from 'styled-components/native';
import Plaform from '@wcpos/common/src/lib/platform';

export const View = styled.View<{ hovered: boolean }>`
	height: 100%;
	align-items: center;
	justify-content: center;
	background-color: ${({ hovered }) => (hovered ? '#f5f5f5' : 'transparent')};

	${
		Plaform.OS !== 'ios' &&
		Plaform.OS !== 'android' &&
		css`
			cursor: col-resize;
		`
	}}
	
`;
