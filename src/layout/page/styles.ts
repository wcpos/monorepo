import styled, { css } from 'styled-components/native';
import { Platform } from 'react-native';

type ThemeProps = import('../../lib/theme/types').ThemeProps;

/**
 * TODO: calc support for react-native?
 * eg: padding-top: calc(20px + ${(props) => props.theme.PAGE_HEADER_PADDING_Y});
 */

export const Page = styled.SafeAreaView<{ theme: ThemeProps }>`
	background-color: ${(props) => props.theme.PAGE_BACKGROUND_COLOR};
	height: 100%;
`;

export const Header = styled.View<{ theme: ThemeProps }>`
	background-color: ${({ theme }) => theme.PAGE_HEADER_BACKGROUND_COLOR};
	padding: ${({ theme }) => `${theme.PAGE_HEADER_PADDING_Y} ${theme.PAGE_HEADER_PADDING_X}`};
`;

/**
 *
 */
export const Main = styled.View<{ theme: ThemeProps }>`
	background-color: ${({ theme }) => theme.PAGE_MAIN_BACKGROUND_COLOR};
	padding: ${({ theme }) => `${theme.PAGE_MAIN_PADDING_Y} ${theme.PAGE_MAIN_PADDING_X}`};
	position: absolute;
	top: 100px;
	bottom: 0;
	left: 0;
	right: 0;
`;
