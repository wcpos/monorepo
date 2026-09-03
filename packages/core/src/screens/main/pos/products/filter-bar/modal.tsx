import {
	Modal,
	ModalBody,
	ModalClose,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@wcpos/components/modal';

import { FilterBarList } from './filter-bar-list';
import { useT } from '../../../../../contexts/translations';

export function FilterBarModal() {
	const t = useT();
	return (
		<Modal>
			<ModalContent size="2xl">
				<ModalHeader>
					<ModalTitle>{t('common.filter_bar')}</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<FilterBarList onEdit={() => undefined} />
				</ModalBody>
				<ModalFooter>
					<ModalClose>{t('common.close')}</ModalClose>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}
