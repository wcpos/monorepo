import styled, { css } from 'styled-components/native';
import Icon from '../icon';
import Pressable from '../pressable';

export const PressableContainer = styled(Pressable)`
	display: flex;
	flex-direction: row;
	${({ disabled }) =>
		disabled &&
		css`
			opacity: 0.5;
		`}
`;

export const Box = styled.View<{ checked: boolean | undefined }>`
	flex: 0 1 auto;
	align-items: center;
	justify-content: center;
	border-style: solid;
	background-color: ${({ theme, checked }) =>
		checked ? theme.CHECKBOX_BACKGROUND_COLOR : 'transparent'};
	width: ${({ theme }) => theme.CHECKBOX_WIDTH};
	height: ${({ theme }) => theme.CHECKBOX_HEIGHT};
	border-width: ${({ theme }) => theme.CHECKBOX_BORDER_WIDTH};
	border-color: ${({ theme }) => theme.CHECKBOX_BORDER_COLOR};
	border-radius: ${({ theme }) => theme.CHECKBOX_BORDER_RADIUS};
`;

export const Check = styled(Icon)`
	color: #fff;
`;

export const LabelWrapper = styled.View`
	flex: 1;
	display: flex;
	flex-direction: column;
	padding: 0 5px;
`;
