import styled, { css } from 'styled-components/native';
import Platform from '../../lib/platform';

type SegmentViewProps = {
	theme: import('../../lib/theme/types').ThemeProps;
} & import('./segment').Props;

type SegmentGroupViewProps = {
	theme: import('../../lib/theme/types').ThemeProps;
} & import('./group').Props;

export const SegmentView = styled.View<SegmentViewProps>`
	background: ${props => props.theme.SEGMENT_BACKGROUND_COLOR};
	border-width: ${props => props.theme.SEGMENT_BORDER_WIDTH};
	border-color: ${props => props.theme.SEGMENT_BORDER_COLOR};
	border-style: solid;
	border-radius: ${props => (props.group === 'middle' ? '0' : props.theme.SEGMENT_BORDER_RADIUS)};
	padding: ${props => props.theme.SEGMENT_PADDING};
	margin-bottom: ${props => (props.group ? '0' : props.theme.SEGMENT_MARGIN_BOTTOM)};

	${props =>
		props.group === 'first' &&
		css`
			border-bottom-left-radius: 0;
			border-bottom-right-radius: 0;
		`}
    
  ${props =>
		props.group === 'last' &&
		css`
			border-top-left-radius: 0;
			border-top-right-radius: 0;
			border-top-width: 0;
		`}
    
  ${props =>
		props.group === 'middle' &&
		css`
			border-top-width: 0;
		`}

	${props =>
		props.raised &&
		Platform.select({
			android: css`
				elevation: 2;
			`,
			default: css`
				box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.2);
			`,
		})}
`;

export const SegmentGroupView = styled.View<SegmentGroupViewProps>`
	${props =>
		props.raised &&
		Platform.select({
			android: css`
				elevation: 2;
			`,
			default: css`
				box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.2);
			`,
		})};
`;
