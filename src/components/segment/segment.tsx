import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import ErrorBoundary from '../error-boundary';
import * as Styled from './styles';

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
	return (
		<Styled.Segment style={style} group={group} raised={raised} grow={grow} direction={direction}>
			<ErrorBoundary>{children}</ErrorBoundary>
		</Styled.Segment>
	);
};
