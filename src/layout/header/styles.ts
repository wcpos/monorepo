import styled, { css } from 'styled-components/native';
import { Platform } from 'react-native';

export const Header = styled.View`
	flex-direction: row;
	background-color: blue;
`;

export const Left = styled.View`
	padding: 5px;
`;

export const Center = styled.View`
	flex: 1;
	align-items: center;
	padding: 5px;
`;

export const Right = styled.View`
	padding: 5px;
`;

export const Title = styled.Text`
	font-size: ${({ theme }) => theme.MASTERBAR_TITLE_SIZE};
	color: ${({ theme }) => theme.MASTERBAR_TITLE_COLOR};
`;
