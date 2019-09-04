import styled, { css } from 'styled-components/native';
import { Platform } from 'react-native';
import { ThemeProps } from '../../lib/theme/types';

export const BarView = styled.View<{ theme: ThemeProps }>`
	background-color: ${props => props.theme.MASTERBAR_BACKGROUND_COLOR};
	flex-direction: row;
	height: 80px;
	align-items: center;

	${Platform.OS === 'ios' &&
		css`
			padding-top: 20px;
		`}
`;

export const LeftView = styled.View<{ theme: ThemeProps }>`
	background-color: ${props => props.theme.MASTERBAR_BACKGROUND_COLOR};
`;

export const CenterView = styled.View<{ theme: ThemeProps }>`
	background-color: ${props => props.theme.MASTERBAR_BACKGROUND_COLOR};
	flex: 1;
	align-items: center;
`;

export const RightView = styled.View<{ theme: ThemeProps }>`
	background-color: ${props => props.theme.MASTERBAR_BACKGROUND_COLOR};
`;

// style={{ fontSize: 18 }}
export const TitleText = styled.Text<{ theme: ThemeProps }>`
	font-size: ${props => props.theme.MASTERBAR_TITLE_SIZE};
	color: ${props => props.theme.MASTERBAR_TITLE_COLOR};
`;
