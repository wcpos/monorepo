import styled from 'styled-components/native';
import { ThemeProps } from '../../lib/theme/types';
import { Props as TextProps } from './text';

type Props = { theme: ThemeProps } & TextProps;

export const StyledText = styled.Text<Props>`
  color: ${props => {
    switch (props.type) {
      case 'secondary':
        return props.theme.TEXT_COLOR_SECONDARY;
      case 'attention':
      case 'critical':
      case 'info':
      case 'success':
      case 'warning':
      case 'inverse':
      default:
        return props.theme.TEXT_COLOR;
    }
  }};
  font-family: ${props => props.theme.FONT_FAMILY};
  font-style: ${props => (props.italic ? 'italic' : 'normal')};
  font-weight: ${props => {
    switch (props.weight) {
      case 'bold':
        return props.theme.FONT_WEIGHT_BOLD;
      case 'light':
        return props.theme.FONT_WEIGHT_LIGHT;
      default:
        return props.theme.FONT_WEIGHT;
    }
  }};
  font-size: ${props => {
    switch (props.size) {
      case 'large':
        return props.theme.FONT_SIZE_LARGE;
      case 'small':
        return props.theme.FONT_SIZE_SMALL;
      default:
        return props.theme.FONT_SIZE;
    }
  }};
  text-align: ${props => props.align};
  text-transform: ${props => (props.uppercase ? 'uppercase' : 'none')};
`;
