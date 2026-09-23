import { View } from 'react-native';

import { DeviceScope } from '../lib/device';
import { Text } from '../text';
import * as C from './index';
export const stories = ['confirm', 'sheet'].map((id) => ({
	id,
	isolated: true,
	render: () => (
		<DeviceScope phone={id === 'sheet'}>
			<View
				className={`border-border bg-background relative h-96 ${id === 'sheet' ? 'w-80' : 'w-full'} overflow-hidden rounded-lg border [&>*]:flex-1`}
			>
				<C.AlertDialog open>
					<C.AlertDialogContent inline testID="gallery-confirm">
						<C.AlertDialogHeader>
							<C.AlertDialogTitle>Delete printer?</C.AlertDialogTitle>
							<C.AlertDialogDescription>
								The receipt printer will be removed from this till.
							</C.AlertDialogDescription>
						</C.AlertDialogHeader>
						<C.AlertDialogFooter>
							<C.AlertDialogCancel testID="cancel">
								<Text>Cancel</Text>
							</C.AlertDialogCancel>
							<C.AlertDialogAction variant="destructive" testID="delete">
								<Text>Delete</Text>
							</C.AlertDialogAction>
						</C.AlertDialogFooter>
					</C.AlertDialogContent>
				</C.AlertDialog>
			</View>
		</DeviceScope>
	),
}));
