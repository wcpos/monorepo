import { Text } from '../text';
import { Card, CardContent } from './index';

export const stories = [
	{
		id: 'plain',
		render: () => (
			<Card>
				<CardContent>
					<Text>Coffee Monster</Text>
				</CardContent>
			</Card>
		),
	},
];
