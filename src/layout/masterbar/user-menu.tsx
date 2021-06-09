import * as React from 'react';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Avatar from '@wcpos/common/src/components/avatar';
import Dropdown from '@wcpos/common/src/components/dropdown';
import Text from '@wcpos/common/src/components/text';
import UserSettings from './user-settings';
import * as Styled from './styles';

// interface Props {
// user: import('@wcpos/common/src/database').UserDocument;
// }

const UserMenu = () => {
	const { user, unsetLastUser } = useAppState();
	const [showSettings, setShowSettings] = React.useState(false);

	return (
		<>
			<Dropdown
				activator={
					<Styled.DropDown>
						<Text type="inverse">{user?.displayName}</Text>
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
							await unsetLastUser();
						},
					},
					{
						label: 'Settings',
						action: () => setShowSettings(true),
					},
				]}
			/>

			{showSettings && <UserSettings onClose={() => setShowSettings(false)} />}
		</>
	);
};

export default UserMenu;
