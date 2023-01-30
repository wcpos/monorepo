import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import Modal from '@wcpos/components/src/modal';

import useModalRefreshFix from '../../hooks/use-modal-refresh-fix';

interface ModalLayoutProps {
	children: React.ReactNode;
}

export const ModalLayout = ({ children }: ModalLayoutProps) => {
	const navigation = useNavigation();
	useModalRefreshFix();

	return (
		<Modal opened withPortal={false} size="large" onClose={() => navigation.goBack()}>
			{children}
		</Modal>
	);
};
