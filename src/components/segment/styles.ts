import styled, { css } from 'styled-components/native';
import { ThemeProps } from '../../lib/theme/types';
import { Props as SegmentProps } from './segment';
import { Props as SegmentGroupProps } from './segment';
import Platform from '../../lib/platform';

type SegmentViewProps = { theme: ThemeProps } & SegmentProps;

export const SegmentView = styled.View<SegmentViewProps>`
  background: ${props => props.theme.SEGMENT_BACKGROUND_COLOR};
  border-width: ${props => props.theme.SEGMENT_BORDER_WIDTH};
  border-color: ${props => props.theme.SEGMENT_BORDER_COLOR};
  border-style: solid;
  border-radius: ${props => props.theme.SEGMENT_BORDER_RADIUS};
  padding: ${props => props.theme.SEGMENT_PADDING};

  ${props =>
    props.raised &&
    Platform.select({
      android: css`
        elevation: 2;
      `,
      default: css`
        shadow-color: 'rgba(0, 0, 0, .4)';
        shadow-offset: { height: 1, width: 1 };
        shadow-opacity: 1;
        shadow-radius: 1;
      `,
    })}
`;

type SegmentGroupViewProps = { theme: ThemeProps } & SegmentGroupProps;

export const SegmentGroupView = styled.View<SegmentGroupViewProps>`
  padding: ${props => props.theme.SEGMENT_GROUP_PADDING};

  ${props =>
    props.raised &&
    Platform.select({
      android: css`
        elevation: 2;
      `,
      default: css`
        shadow-color: 'rgba(0, 0, 0, .4)';
        shadow-offset: { height: 1, width: 1 };
        shadow-opacity: 1;
        shadow-radius: 1;
      `,
    })}
`;
