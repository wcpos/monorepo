import * as React from 'react';
import { useNavigation, CommonActions } from '@react-navigation/native';
// import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Avatar from '@wcpos/common/src/components/avatar';
import Dropdown from '@wcpos/common/src/components/dropdown';
import Text from '@wcpos/common/src/components/text';
import Modal, { useModal } from '@wcpos/common/src/components/modal4';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import UserSettings from './user-settings';
import * as Styled from './styles';

// interface Props {
// user: import('@wcpos/common/src/database').UserDocument;
// }

export const UserMenu = () => {
	const { site, wpCredentials, store } = useAppState();
	const { ref: refSettingsModal, open: openSettingsModal, close: closeSettingsModal } = useModal();
	const navigation = useNavigation();

	return (
		<>
			<Dropdown
				items={[
					{
						label: 'Logout',
						action: () => {
							site.collection.upsertLocal('current', { id: null });
							wpCredentials.collection.upsertLocal('current', { id: null });
							store.collection.upsertLocal('current', { id: null });
							navigation.goBack();
						},
						type: 'warning',
					},
					{
						label: 'Settings',
						action: openSettingsModal,
					},
					{
						label: 'Modal',
						action: () =>
							navigation.dispatch(
								CommonActions.navigate({ name: 'Modal', params: { foo: 'bar' } })
							),
					},
				]}
			>
				<Styled.DropDown>
					<Text type="inverse">Test</Text>
					<Avatar
						src="https://secure.gravatar.com/avatar/a2a53c07cdd4a8aa81c043baafd0915f"
						// placeholder="PK"
						size="small"
					/>
				</Styled.DropDown>
			</Dropdown>

			<Modal ref={refSettingsModal}>
				<UserSettings onClose={closeSettingsModal} />
			</Modal>
		</>
	);
};
