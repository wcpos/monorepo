import styled, { css } from 'styled-components/native';
import { Platform } from 'react-native';

type ThemeProps = import('../../lib/theme').ThemeProps;

export const Header = styled.View<{ theme: ThemeProps }>`
	flex-direction: row;
	background-color: blue;
`;

export const Left = styled.View<{ theme: ThemeProps }>`
	padding: 5px;
`;

export const Center = styled.View<{ theme: ThemeProps }>`
	flex: 1;
	align-items: center;
	padding: 5px;
`;

export const Right = styled.View<{ theme: ThemeProps }>`
	padding: 5px;
`;

export const Title = styled.Text<{ theme: ThemeProps }>`
	font-size: ${({ theme }) => theme.MASTERBAR_TITLE_SIZE};
	color: ${({ theme }) => theme.MASTERBAR_TITLE_COLOR};
`;
