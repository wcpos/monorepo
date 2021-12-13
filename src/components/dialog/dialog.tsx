import React from 'react';
import Modal from '../modal';
import Text from '../text';
import * as Styled from './styles';

export type DialogProps = {
	/**
	 * Dialog Title.
	 */
	title?: string;
	/**
	 * Function called when the dialog is closed.
	 */
	onClose: (accepted: boolean) => void;
	/**
	 * Dialog content.
	 */
	children: React.ReactNode;
	/**
	 * Set to true to hide the close modal button.
	 */
	hideClose?: boolean;
};

/**
 * Show interactive content on top of an existing screen.
 * It should be used thoughtfully and sparingly, as it stops the user in its current flow.
 */
export const DialogBase = ({ children, onClose }: DialogProps, ref) => {
	const decline = React.useCallback(() => {
		ref.current.close('default', () => onClose(false));
	}, [onClose, ref]);
	const accept = React.useCallback(() => {
		ref.current.close('default', () => onClose(true));
	}, [onClose, ref]);

	return (
		<Modal
			ref={ref}
			size="small"
			primaryAction={{ label: 'Confirm', action: accept, type: 'primary' }}
			secondaryActions={[{ label: 'Cancel', action: decline, type: 'secondary' }]}
		>
			{typeof children === 'string' ? <Text>{children}</Text> : children}
		</Modal>
	);
};

export const Dialog = React.forwardRef(DialogBase);
