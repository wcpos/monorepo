import styled, { css } from 'styled-components/native';
import Platform from '../../lib/platform';

type SegmentProps = {
	theme: import('../../lib/theme/types').ThemeProps;
} & import('./segment').Props;

export const Segment = styled.View<SegmentProps>`
	background: ${({ theme }) => theme.SEGMENT_BACKGROUND_COLOR};
	border-width: ${({ theme }) => theme.SEGMENT_BORDER_WIDTH};
	border-color: ${({ theme }) => theme.SEGMENT_BORDER_COLOR};
	border-style: solid;
	border-radius: ${({ group, theme }) => (group === 'middle' ? '0' : theme.SEGMENT_BORDER_RADIUS)};
	padding: ${({ theme }) => theme.SEGMENT_PADDING};
	margin-bottom: ${({ group, theme }) => (group ? '0' : theme.SEGMENT_MARGIN_BOTTOM)};
	flex-grow: ${({ grow }) => (grow ? '1' : '0')};

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

type GroupProps = {
	theme: import('../../lib/theme/types').ThemeProps;
} & import('./group').Props;

export const Group = styled.View<GroupProps>`
	flex-direction: ${({ direction }) => (direction === 'horizontal' ? 'row' : 'column')};
	height: inherit;
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
