import { View } from 'react-native';

import { DeviceScope } from '../lib/device';
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
						<C.AlertDialogFooter
							cancel={{ testID: 'cancel' }}
							confirm={{ label: 'Delete', destructive: true, testID: 'delete' }}
						/>
					</C.AlertDialogContent>
				</C.AlertDialog>
			</View>
		</DeviceScope>
	),
}));
