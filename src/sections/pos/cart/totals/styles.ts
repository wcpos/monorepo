import styled from 'styled-components/native';
import { StyledText } from '../../../../components/text/styles';

type Props = { theme: import('../../../../lib/theme/types').ThemeProps };

export const Wrapper = styled.View<Props>``;

export const TotalText = styled(StyledText)<Props>``;
