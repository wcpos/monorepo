import React from 'react';
import { Modal } from 'react-native';
import { Header } from './header';
import { FooterProps, Footer } from './footer';
import { Section, SectionProps } from './section';
import Backdrop from '../backdrop';
import * as Styled from './styles';

export type DialogProps = {
	/**
	 * Dialog Title.
	 */
	title?: string;
	/**
	 * Determines if the Dialog is shown or not.
	 */
	open: boolean;
	/**
	 * Function called when the dialog is closed.
	 */
	onClose: () => void;
	/**
	 * Dialog content.
	 */
	children: React.ReactNode;
	/**
	 * Provides a default `Dialog.Section` in the Dialog. All content will be wrapped in it.
	 */
	sectioned?: boolean;
	/**
	 * Set to true to hide the close modal button.
	 */
	hideClose?: boolean;
} & FooterProps;

/**
 * Show interactive content on top of an existing screen.
 * It should be used thoughtfully and sparingly, as it stops the user in its current flow.
 */
export const Dialog: React.FC<DialogProps> & { Section: typeof Section } = ({
	title,
	open,
	onClose,
	children,
	primaryAction,
	secondaryActions = [],
	sectioned = false,
	hideClose = false,
}) => {
	return (
		<Modal
			visible={open}
			onDismiss={onClose}
			onRequestClose={onClose}
			animationType="fade"
			transparent
		>
			<Backdrop open={open}>
				<Styled.Container>
					<Header title={title} onClose={onClose} hideClose={hideClose} />
					{sectioned ? <Section>{children}</Section> : children}
					<Footer primaryAction={primaryAction} secondaryActions={secondaryActions} />
				</Styled.Container>
			</Backdrop>
		</Modal>
	);
};

Dialog.Section = Section;
export type DialogSectionProps = SectionProps;
