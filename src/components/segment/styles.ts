import styled, { css } from 'styled-components/native';
import Platform from '@wcpos/common/src/lib/platform';

type SegmentProps = import('./segment').SegmentProps;
type StyledSegmentProps = Pick<SegmentProps, 'raised' | 'group' | 'grow' | 'type'>;

export const Segment = styled.View<StyledSegmentProps>`
	background: ${({ theme }) => theme.SEGMENT_BACKGROUND_COLOR};
	border-width: ${({ theme }) => theme.SEGMENT_BORDER_WIDTH};
	border-color: ${({ theme }) => theme.SEGMENT_BORDER_COLOR};
	border-style: solid;
	border-radius: ${({ group, theme }) => (group === 'middle' ? '0' : theme.SEGMENT_BORDER_RADIUS)};
	padding: ${({ theme, grow }) => (grow ? 0 : theme.SEGMENT_PADDING)};
	margin-bottom: ${({ group, theme }) => (group ? '0' : theme.SEGMENT_MARGIN_BOTTOM)};
	flex: ${({ grow }) => (grow ? '1' : '0 1 auto')};

	${({ group }) =>
		group === 'first' &&
		css`
			border-bottom-left-radius: 0;
			border-bottom-right-radius: 0;
		`}

	${({ group }) =>
		group === 'last' &&
		css`
			border-top-left-radius: 0;
			border-top-right-radius: 0;
			border-top-width: 0;
		`}
    
  ${({ group }) =>
		group === 'middle' &&
		css`
			border-top-width: 0;
		`}

	${({ raised }) =>
		raised &&
		Platform.select({
			android: css`
				elevation: 2;
			`,
			default: css`
				box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.2);
			`,
		})}
`;

type SegmentGroupProps = import('./group').SegmentGroupProps;
type StyledGroupProps = Pick<SegmentGroupProps, 'raised' | 'flexDirection' | 'group' | 'grow'>;

// height: inherit;
/**
 * Note: height 'inherit' caused app to crash on mobile
 */
export const Group = styled.View<StyledGroupProps>`
	flex-direction: ${({ flexDirection }) => flexDirection};
	flex: ${({ grow }) => (grow ? '1' : '0 1 auto')};
	height: 100%;
	max-height: 100%;
	width: 100%;

	${({ raised }) =>
		raised &&
		Platform.select({
			android: css`
				elevation: 2;
			`,
			default: css`
				box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.2);
			`,
		})};
`;
