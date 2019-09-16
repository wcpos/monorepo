import styled from 'styled-components/native';
import { StyledText } from '../text/styles';

type Props = { theme: import('../../lib/theme/types').ThemeProps } & import('./select').Props;

export const TriggerWrapper = styled.View<Props>``;

export const TriggerText = styled(StyledText)<Props>``;
