import * as React from 'react';
import { StyleSheet } from 'react-native';
import { Segment, SegmentProps } from './segment';
import { SegmentGroup } from './group';
import Button from '../button';

export interface Action {
	/**
	 * Label to display.
	 */
	label: string;
	/**
	 * Action to execute on click.
	 */
	action?: () => void;
	/**
	 *
	 */
	type?: import('@wcpos/common/src/themes').ColorTypes;
}

export type SegmentButtonProps = {
	/**
	 * Primary action to perform in the Dialog. Will be displayed as a Primary Button.
	 */
	primaryAction: Action;
	/**
	 * Optional Secondary actions that can be performed (will appear in reverse order,
	 * as first option is the most important and should appear on the right).
	 *
	 * Use secondary options sparingly, most times, a maximum of 1 secondary action should
	 * be enough.
	 */
	secondaryActions?: Action[];
} & Omit<SegmentProps, 'children'>;

export const SegmentButtons = ({
	primaryAction,
	secondaryActions,
	style,
	...rest
}: SegmentButtonProps) => {
	return (
		<SegmentGroup direction="horizontal" style={{ height: 50 }}>
			<Segment {...rest} style={[{ padding: 0 }, StyleSheet.flatten(style)]}>
				<Button
					title={primaryAction.label}
					type={primaryAction.type}
					onPress={primaryAction.action}
					size="full"
				/>
			</Segment>
		</SegmentGroup>
	);
};
