import * as React from 'react';
import { useNavigation, CommonActions } from '@react-navigation/native';
// import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Avatar from '@wcpos/common/src/components/avatar';
import Dropdown from '@wcpos/common/src/components/dropdown';
import Text from '@wcpos/common/src/components/text';
import UserSettings from './user-settings';
import * as Styled from './styles';

// interface Props {
// user: import('@wcpos/common/src/database').UserDocument;
// }

export const UserMenu = () => {
	const [showSettings, setShowSettings] = React.useState(false);
	const navigation = useNavigation();

	return (
		<>
			<Dropdown
				activator={
					<Styled.DropDown>
						<Text type="inverse">Test</Text>
						<Avatar
							src="https://secure.gravatar.com/avatar/a2a53c07cdd4a8aa81c043baafd0915f"
							// placeholder="PK"
							size="small"
						/>
					</Styled.DropDown>
				}
				items={[
					{
						label: 'Logout',
						action: async () => {
							// @ts-ignore
							navigation.navigate('Auth');
							// await unsetLastUser();
						},
						type: 'warning',
					},
					{
						label: 'Settings',
						action: () => setShowSettings(true),
					},
					{
						label: 'Modal',
						action: () =>
							navigation.dispatch(
								CommonActions.navigate({ name: 'Modal', params: { foo: 'bar' } })
							),
					},
				]}
			/>

			{showSettings && <UserSettings onClose={() => setShowSettings(false)} />}
		</>
	);
};
