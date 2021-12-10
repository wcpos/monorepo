import * as React from 'react';
import { View } from 'react-native';
import { StoryWrapper } from '@storybook/addons';
import { Modal, ModalProps } from './modal';
import { useModal } from './use-modal';
import Portal from '../portal';
import Text from '../text';
import Button from '../button';
import Icon from '../icon';

/**
 * Modal require
 * - Portals
 */
const AppProvider: StoryWrapper = (Story, context) => {
	return (
		<Portal.Provider>
			<Story {...context} />
			<Portal.Manager />
		</Portal.Provider>
	);
};

export default {
	title: 'Components/Modal',
	component: Modal,
	decorators: [AppProvider],
};

export const BasicUsage = (props: ModalProps) => {
	const modalRef = React.useRef<typeof Modal>(null);

	const onOpen = () => {
		modalRef.current?.open();
	};

	const onClose = () => {
		modalRef.current?.close();
	};

	return (
		<>
			<Button title="Open the modal" onPress={onOpen} />

			<Modal ref={modalRef}>
				<Text>Modal Content</Text>
				<Icon name="xmark" onPress={onClose} />
			</Modal>
		</>
	);
};

export const UseModal = (props: ModalProps) => {
	const { ref, open, close } = useModal();

	return (
		<>
			<Button title="Open the modal" onPress={open} />

			<Modal ref={ref}>
				<Text>Modal Content</Text>
				<Icon name="xmark" onPress={close} />
			</Modal>
		</>
	);
};
