import styled from 'styled-components/native';
import { ThemeProps } from '../../lib/theme/types';

export const AuthView = styled.View<{ theme: ThemeProps }>`
	align-items: center;
	justify-content: center;
	flex: 1;
	background-color: ${props => props.theme.APP_BACKGROUND_COLOR};
`;
