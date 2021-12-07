import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Text from '../text';
import ErrorBoundary from '../error-boundary';
import * as Styled from './styles';
import { SegmentGroup } from './group';

/**
 *
 */
export interface SegmentProps {
	/**
	 *
	 */
	children?: React.ReactNode;
	/**
	 *
	 */
	disabled?: boolean;
	/**
	 *
	 */
	loading?: boolean;
	/**
	 *
	 */
	raised?: boolean;
	/**
	 *
	 */
	group?: 'first' | 'middle' | 'last';
	/**
	 *
	 */
	direction?: 'horizontal' | 'vertical';
	/**
	 *
	 */
	style?: StyleProp<ViewStyle>;
	/**
	 *
	 */
	actions?: [];
	/**
	 *
	 */
	grow?: boolean;
}

/**
 *
 */
export const Segment = ({
	children,
	group,
	grow,
	raised = true,
	style,
	direction,
}: SegmentProps) => {
	const renderSegement = children;

	return (
		<Styled.Segment style={style} group={group} raised={raised} grow={grow} direction={direction}>
			<ErrorBoundary>{renderSegement}</ErrorBoundary>
		</Styled.Segment>
	);
};

Segment.Group = SegmentGroup;
