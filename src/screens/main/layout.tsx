import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import Modal from '@wcpos/components/src/modal';

import useModalRefreshFix from '../../hooks/use-modal-refresh-fix';
import { t } from '../../lib/translations';

interface ModalLayoutProps {
	children: React.ReactNode;
}

export const ModalLayout = ({ children }: ModalLayoutProps) => {
	const navigation = useNavigation();
	useModalRefreshFix();

	return (
		<Modal
			opened
			withPortal={false}
			size="large"
			title={t('Settings', { _tags: 'core' })}
			onClose={() => navigation.goBack()}
		>
			{children}
		</Modal>
	);
};
