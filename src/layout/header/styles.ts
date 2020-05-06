import styled, { css } from 'styled-components/native';
import { Platform } from 'react-native';
import { ThemeProps } from '../../lib/theme/types';

export const LeftView = styled.View<{ theme: ThemeProps }>``;

export const CenterView = styled.View<{ theme: ThemeProps }>`
	flex: 1;
	align-items: center;
`;

export const RightView = styled.View<{ theme: ThemeProps }>``;

// style={{ fontSize: 18 }}
export const TitleText = styled.Text<{ theme: ThemeProps }>`
	font-size: ${(props) => props.theme.MASTERBAR_TITLE_SIZE};
	color: ${(props) => props.theme.MASTERBAR_TITLE_COLOR};
`;
