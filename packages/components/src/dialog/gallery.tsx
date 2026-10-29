import { View } from 'react-native';

import { Input } from '../input';
import { DeviceScope } from '../lib/device';
import { Text } from '../text';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	type DialogFooterProps,
	DialogHeader,
	DialogTitle,
	DismissIsClose,
} from './index';

const noop = () => {};
export const stories = [
	...(
		[
			{ id: 'footer-intent', close: true, intent: { label: 'Add to cart' } },
			{
				id: 'footer-record',
				destructive: { label: 'Delete' },
				record: { label: 'Sync' },
				close: true,
			},
			{
				id: 'footer-sale',
				recordShell: true,
				destructive: { label: 'Void' },
				secondary: { label: 'Print', icon: 'print' },
				intent: { label: 'Sync order' },
			},
			{
				id: 'footer-register',
				close: false,
				size: 'lg',
				secondary: { label: 'Print Z report' },
				intent: { label: 'Done' },
			},
		] satisfies (DialogFooterProps & { id: string; recordShell?: boolean })[]
	).map(({ id, recordShell, ...footer }) => ({
		id,
		render: () => (
			<View className="border-border bg-background relative h-96 w-full overflow-hidden rounded-lg border">
				<Dialog open onOpenChange={noop}>
					<DialogContent inline side="center" testID={`gallery-${id}`}>
						<DialogHeader>
							<DialogTitle>Footer actions</DialogTitle>
						</DialogHeader>
						<DialogBody>
							<Text>Actions for this record or sale.</Text>
						</DialogBody>
						{recordShell ? (
							<DismissIsClose>
								<DialogFooter {...footer} />
							</DismissIsClose>
						) : (
							<DialogFooter {...footer} />
						)}
					</DialogContent>
				</Dialog>
			</View>
		),
	})),
	{
		id: 'center',
		render: () => (
			<View className="border-border bg-background relative h-96 w-full overflow-hidden rounded-lg border">
				<Dialog open onOpenChange={noop}>
					<DialogContent inline testID="gallery-dialog-center" side="center" size="md">
						<DialogHeader>
							<DialogTitle>Email receipt</DialogTitle>
							<DialogDescription>Send a copy to the customer.</DialogDescription>
						</DialogHeader>
						<DialogBody>
							<Input testID="center-email" placeholder="Email address" />
						</DialogBody>
						<DialogFooter
							close={{ testID: 'center-cancel' }}
							intent={{ label: 'Send', testID: 'center-send' }}
						/>
					</DialogContent>
				</Dialog>
			</View>
		),
	},
	{
		id: 'right',
		render: () => (
			<View className="border-border bg-background relative h-96 w-full overflow-hidden rounded-lg border">
				<Dialog open onOpenChange={noop}>
					<DialogContent inline testID="gallery-dialog-right" side="right" size="lg">
						<DialogHeader>
							<DialogTitle>Edit line</DialogTitle>
						</DialogHeader>
						<DialogBody>
							<Input testID="right-name" placeholder="Name" />
							<Input testID="right-price" placeholder="Price" />
							<Input testID="right-quantity" placeholder="Quantity" />
						</DialogBody>
						<DialogFooter
							close={{ testID: 'right-cancel' }}
							intent={{ label: 'Save', testID: 'right-save' }}
						/>
					</DialogContent>
				</Dialog>
			</View>
		),
	},
	{
		id: 'left',
		render: () => (
			<View className="border-border bg-background relative h-96 w-full overflow-hidden rounded-lg border">
				<Dialog open onOpenChange={noop}>
					<DialogContent inline testID="gallery-dialog-left" side="left" size="lg">
						<DialogHeader>
							<DialogTitle>Order</DialogTitle>
						</DialogHeader>
						<DialogBody>
							<Text>2 items</Text>
						</DialogBody>
						<DialogFooter
							destructive={{ label: 'Void', testID: 'left-void' }}
							secondary={{ label: 'Print bill', testID: 'left-print' }}
							intent={{ label: 'Save', testID: 'left-save' }}
						/>
					</DialogContent>
				</Dialog>
			</View>
		),
	},
	{
		id: 'sheet',
		render: () => (
			<View className="border-border bg-background relative h-96 w-full overflow-hidden rounded-lg border">
				<Dialog open onOpenChange={noop}>
					<DialogContent inline testID="gallery-dialog-sheet" side="bottom" size="md">
						<DialogHeader>
							<DialogTitle>Count the drawer</DialogTitle>
						</DialogHeader>
						<DialogBody>
							<Input testID="sheet-count" />
						</DialogBody>
					</DialogContent>
				</Dialog>
			</View>
		),
	},
	{
		id: 'page',
		render: () => (
			<DeviceScope phone>
				<View className="border-border bg-background relative h-96 w-80 overflow-hidden rounded-lg border">
					<Dialog open onOpenChange={noop}>
						<DialogContent inline testID="gallery-dialog-page" side="right" size="lg">
							<DialogHeader>
								<DialogTitle>Printer</DialogTitle>
							</DialogHeader>
							<DialogBody>
								<Input testID="page-printer-name" />
								<Input testID="page-printer-address" />
							</DialogBody>
						</DialogContent>
					</Dialog>
				</View>
			</DeviceScope>
		),
	},
	{
		id: 'phone-center',
		render: () => (
			<DeviceScope phone>
				<View className="border-border bg-background relative h-96 w-80 overflow-hidden rounded-lg border">
					<Dialog open onOpenChange={noop}>
						<DialogContent inline testID="gallery-dialog-phone-center" side="center" size="md">
							<DialogHeader>
								<DialogTitle>Email receipt</DialogTitle>
							</DialogHeader>
							<DialogBody>
								<Input testID="phone-center-email" placeholder="Email address" />
							</DialogBody>
							<DialogFooter
								close={{ testID: 'phone-center-cancel' }}
								intent={{ label: 'Send', testID: 'phone-center-send' }}
							/>
						</DialogContent>
					</Dialog>
				</View>
			</DeviceScope>
		),
	},
];
