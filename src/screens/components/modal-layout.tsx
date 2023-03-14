import * as React from 'react';

import { useNavigation, StackActions } from '@react-navigation/native';

import Modal, { ModalProps } from '@wcpos/components/src/modal';

import useModalRefreshFix from '../../hooks/use-modal-refresh-fix';

type ModalLayoutProps = Omit<ModalProps, 'opened' | 'onClose'>;

/**
 *
 */
export const ModalLayout = ({ children, ...props }: ModalLayoutProps) => {
	const navigation = useNavigation();
	useModalRefreshFix();

	return (
		<Modal
			size="large"
			{...props}
			withPortal={false}
			opened
			onClose={() => navigation.dispatch(StackActions.pop(1))}
		>
			{children}
		</Modal>
	);
};
