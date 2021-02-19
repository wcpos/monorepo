import styled from 'styled-components/native';
import { StyledText } from '../text/styles';

type ThemeProps = import('../../lib/theme').ThemeProps;

export const Wrapper = styled.View<{ theme: ThemeProps }>``;

export const MenuItemText = styled(StyledText)<{ theme: ThemeProps }>``;
