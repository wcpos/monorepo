import styled, { css } from 'styled-components/native';
import { ThemeProps } from '../../lib/theme/types';
import { Platform } from 'react-native';

export const SideBarView = styled.View<{ theme: ThemeProps }>`
	background-color: ${props => props.theme.SIDEBAR_BACKGROUND_COLOR};

	${Platform.OS === 'web' &&
		css`
			flex: 1;
			height: 100%;
			width: 300px;
		`}

	${Platform.OS === 'ios' &&
		css`
			padding-top: 20px;
		`}
`;
