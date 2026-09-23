import { Button, ButtonText } from '../button';
import { Text } from '../text';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './index';

export const stories = [
	{
		id: 'sections',
		render: () => (
			<Card>
				<CardHeader>
					<CardTitle>Coffee Monster</CardTitle>
					<CardDescription>Main Street till</CardDescription>
				</CardHeader>
				<CardContent>
					<Text>Ready for the next sale.</Text>
				</CardContent>
				<CardFooter>
					<Button variant="outline" testID="gallery-card-open">
						<ButtonText>Open</ButtonText>
					</Button>
				</CardFooter>
			</Card>
		),
	},
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
