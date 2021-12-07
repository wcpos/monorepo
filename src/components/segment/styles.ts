import styled, { css } from 'styled-components/native';
import Platform from '@wcpos/common/src/lib/platform';

type SegmentProps = import('./segment').SegmentProps;
type StyledSegmentProps = Pick<SegmentProps, 'raised' | 'group' | 'grow' | 'direction'>;

export const Segment = styled.View<StyledSegmentProps>`
	background: ${({ theme }) => theme.SEGMENT_BACKGROUND_COLOR};
	padding: ${({ theme }) => theme.SEGMENT_PADDING};
	flex-grow: ${({ grow }) => (grow ? 1 : 0)};
	flex-shrink: 1;
	flex-basis: auto;

	border-width: ${({ theme, group }) => (group ? 0 : theme.SEGMENT_BORDER_WIDTH)};
	border-color: ${({ theme }) => theme.SEGMENT_BORDER_COLOR};
	border-style: solid;
	border-radius: ${({ group, theme }) => (group === 'middle' ? '0' : theme.SEGMENT_BORDER_RADIUS)};

	${({ group, direction, theme }) => {
		if (group === 'first' && direction === 'vertical') {
			return css`
				border-bottom-left-radius: 0;
				border-bottom-right-radius: 0;
				border-bottom-width: ${theme.SEGMENT_BORDER_WIDTH};
			`;
		}
		if (group !== 'last' && direction === 'vertical') {
			return css`
				border-bottom-width: ${theme.SEGMENT_BORDER_WIDTH};
			`;
		}
		if (group === 'last' && direction === 'vertical') {
			return css`
				border-top-left-radius: 0;
				border-top-right-radius: 0;
			`;
		}
		if (group === 'first' && direction === 'horizontal') {
			return css`
				border-top-right-radius: 0;
				border-bottom-right-radius: 0;
				border-right-width: ${theme.SEGMENT_BORDER_WIDTH};
			`;
		}
		if (group !== 'last' && direction === 'horizontal') {
			return css`
				border-right-width: ${theme.SEGMENT_BORDER_WIDTH};
			`;
		}
		if (group === 'last' && direction === 'horizontal') {
			return css`
				border-top-left-radius: 0;
				border-bottom-left-radius: 0;
			`;
		}

		return css``;
	}}

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
type StyledGroupProps = Pick<
	SegmentGroupProps,
	'raised' | 'direction' | 'group' | 'grow' | 'isNested'
>;

/**
 * Note: height 'inherit' caused app to crash on mobile
 */
export const Group = styled.View<StyledGroupProps>`
	flex-direction: ${({ direction }) => (direction === 'horizontal' ? 'row' : 'column')};
	flex-grow: ${({ grow }) => (grow ? 1 : 0)};
	flex-shrink: 1;
	flex-basis: auto;

	border-width: ${({ theme, isNested }) => (isNested ? 0 : theme.SEGMENT_BORDER_WIDTH)};
	border-color: ${({ theme }) => theme.SEGMENT_BORDER_COLOR};
	border-style: solid;
	border-radius: ${({ group, theme, isNested }) =>
		group === 'middle' || isNested ? '0' : theme.SEGMENT_BORDER_RADIUS};

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
