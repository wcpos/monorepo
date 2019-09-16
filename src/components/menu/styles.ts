import styled from 'styled-components/native';
import { StyledText } from '../text/styles';

type Props = { theme: import('../../lib/theme/types').ThemeProps } & import('./menu').Props;

export const Wrapper = styled.View<Props>``;

export const MenuItemText = styled(StyledText)<Props>``;
