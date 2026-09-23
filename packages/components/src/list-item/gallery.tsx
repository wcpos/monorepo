import { Avatar } from '../avatar';
import { Text } from '../text';
import { ListItem } from './index';

const person = {
	title: 'Paul Kilmurray',
	subtitle: 'Administrator',
	leading: <Avatar fallback="PK" />,
};
export const stories = [
	{ id: 'default', render: () => <ListItem {...person} /> },
	{ id: 'selected', render: () => <ListItem {...person} selected /> },
	{
		id: 'warning',
		render: () => <ListItem {...person} variant="warning" trailing={<Text>Expired</Text>} />,
	},
	{ id: 'dashed', render: () => <ListItem variant="dashed" title="Add another store" /> },
	{ id: 'removable', render: () => <ListItem {...person} removable onRemove={() => {}} /> },
];
