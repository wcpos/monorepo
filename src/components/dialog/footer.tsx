import * as React from 'react';
import Button from '../button';
import * as Styled from './styles';

export interface FooterProps {
	/**
	 * Primary action to perform in the Dialog. Will be displayed as a Primary Button.
	 */
	primaryAction: { label: string; action?: () => void };
	/**
	 * Optional Secondary actions that can be performed (will appear in reverse order,
	 * as first option is the most important and should appear on the right).
	 *
	 * Use secondary options sparingly, most times, a maximum of 1 secondary action should
	 * be enough.
	 */
	secondaryActions?: { label: string; action?: () => void }[];
}

/**
 * Displays the Modal Footer.
 */
export const Footer = ({ primaryAction, secondaryActions = [] }: FooterProps) => (
	<Styled.Footer>
		<Button.Group alignment="end">
			{secondaryActions?.reverse()?.map(({ action, label }, i) => (
				<Button key={i} onPress={action}>
					{label}
				</Button>
			))}
			<Button type="primary" onPress={primaryAction.action}>
				{primaryAction.label}
			</Button>
		</Button.Group>
	</Styled.Footer>
);
