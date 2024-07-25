import styled from 'styled-components/native';
import { ThemeProps } from '../../lib/theme/types';
import { Props as LoaderProps } from './loader';

type Props = { theme: ThemeProps } & LoaderProps;

export const ActivityIndicator = styled.ActivityIndicator.attrs<Props>(({ color, theme }) => ({
	color: color || theme.colors.primary,
}))``;
