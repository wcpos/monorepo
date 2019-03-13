import styled, { css } from 'styled-components/native';
import { StyleSheet } from 'react-native';

import { Props } from './image';

export const Img = styled.Image<Props>`
  border-style: solid;

  /** Rounded */
  ${props => {
    switch (props.border) {
      case 'rounded':
        return css`
          border-radius: 0.3125em;
        `;
      case 'circular':
        return css`
          border-radius: 500rem;
        `;
      default:
        return css`
          border-radius: 0;
        `;
    }
  }}
`;

export const Wrapper = styled.View`
  background-color: transparent;
  position: relative;
`;

export const Placeholder = styled.View`
  background-color: #bdbdbd;
  align-items: center;
  justify-content: center;
`;

const styles = {
  container: {
    backgroundColor: 'transparent',
    position: 'relative',
  },
  placeholderContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  placeholder: {
    backgroundColor: '#bdbdbd',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

export default styles;
