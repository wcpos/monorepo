import styled from 'styled-components/native';
import { ThemeProps } from '../../lib/theme/types';

export const ListView = styled.View<{ theme: ThemeProps }>`
	background-color: ${props => props.theme.SIDEBAR_BACKGROUND_COLOR};
`;

export const ListItemText = styled.Text<{ theme: ThemeProps }>`
	background-color: ${props => props.theme.SIDEBAR_BACKGROUND_COLOR};
`;
