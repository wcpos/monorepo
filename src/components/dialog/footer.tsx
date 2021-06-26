import * as React from 'react';
import Button from '../button';
import * as Styled from './styles';

export interface Actions {
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

export interface FooterProps {
	/**
	 * Primary action to perform in the Dialog. Will be displayed as a Primary Button.
	 */
	primaryAction: Actions;
	/**
	 * Optional Secondary actions that can be performed (will appear in reverse order,
	 * as first option is the most important and should appear on the right).
	 *
	 * Use secondary options sparingly, most times, a maximum of 1 secondary action should
	 * be enough.
	 */
	secondaryActions?: Actions[];
}

/**
 * Displays the Modal Footer.
 */
export const Footer = ({ primaryAction, secondaryActions = [] }: FooterProps) => (
	<Styled.Footer>
		<Button.Group alignment="end">
			{secondaryActions?.reverse()?.map(({ action, label, type = 'secondary' }, i) => (
				<Button key={i} onPress={action} type={type}>
					{label}
				</Button>
			))}
			<Button
				onPress={primaryAction.action}
				type={primaryAction.type ? primaryAction.type : 'primary'}
			>
				{primaryAction.label}
			</Button>
		</Button.Group>
	</Styled.Footer>
);
