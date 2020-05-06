import styled, { css } from 'styled-components/native';
import { Platform } from 'react-native';
import { ThemeProps } from '../../lib/theme/types';

/**
 * TODO: calc support for react-native?
 * eg: padding-top: calc(20px + ${(props) => props.theme.PAGE_HEADER_PADDING_Y});
 */

export const PageView = styled.View<{ theme: ThemeProps }>`
	background-color: ${(props) => props.theme.PAGE_BACKGROUND_COLOR};
	height: 100%;
`;

export const HeaderView = styled.View<{ theme: ThemeProps }>`
	flex-direction: row;
	background-color: ${(props) => props.theme.PAGE_HEADER_BACKGROUND_COLOR};
	padding: ${(props) => props.theme.PAGE_HEADER_PADDING_Y}
		${(props) => props.theme.PAGE_HEADER_PADDING_X};

	${Platform.OS === 'ios' &&
	css`
		padding-top: 25px;
	`}
`;

export const MainView = styled.View<{ theme: ThemeProps }>`
	background-color: ${(props) => props.theme.PAGE_MAIN_BACKGROUND_COLOR};
	padding: ${(props) => props.theme.PAGE_MAIN_PADDING_Y}
		${(props) => props.theme.PAGE_MAIN_PADDING_X};
	flex-direction: row;
	flex-grow: 1;
`;
