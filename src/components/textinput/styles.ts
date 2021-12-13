import styled, { css } from 'styled-components/native';
import Platform from '@wcpos/common/src/lib/platform';

export const Box = styled.View<{ focused: boolean }>`
	background: ${({ theme }) => theme.SEGMENT_BACKGROUND_COLOR};
	border-width: ${({ theme }) => theme.SEGMENT_BORDER_WIDTH};
	border-color: ${({ theme, focused }) => (focused ? 'green' : theme.SEGMENT_BORDER_COLOR)};
	border-style: solid;
	border-radius: ${({ theme }) => theme.SEGMENT_BORDER_RADIUS};
`;

export const TextInput = styled.TextInput`
	font-size: ${({ theme }) => theme.INPUT_FONT_SIZE};
	padding: 0;

	${
		Platform.OS !== 'ios' &&
		Platform.OS !== 'android' &&
		css`
			outline-width: 0;
		`
	}}
`;
