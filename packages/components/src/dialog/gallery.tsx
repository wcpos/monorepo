import { View } from 'react-native';

import { Button } from '../button';
import { Input } from '../input';
import { DeviceScope } from '../lib/device';
import { Text } from '../text';
import {
	Dialog,
	DialogAction,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	type DialogFooterProps,
	DialogHeader,
	DialogTitle,
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
				destructive: { label: 'Void' },
				secondary: { label: 'Print', icon: 'print' },
				intent: { label: 'Sync order' },
			},
			{
				id: 'footer-register',
				size: 'lg',
				secondary: { label: 'Print Z report' },
				intent: { label: 'Done' },
			},
		] satisfies (DialogFooterProps & { id: string })[]
	).map(({ id, ...footer }) => ({
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
						<DialogFooter {...footer} />
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
						<DialogFooter>
							<DialogClose testID="center-cancel">
								<Text>Cancel</Text>
							</DialogClose>
							<DialogAction testID="center-send">
								<Text>Send</Text>
							</DialogAction>
						</DialogFooter>
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
						<DialogFooter>
							<DialogClose testID="right-cancel">
								<Text>Cancel</Text>
							</DialogClose>
							<DialogAction testID="right-save">
								<Text>Save</Text>
							</DialogAction>
						</DialogFooter>
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
						<DialogFooter>
							<Button testID="left-void" variant="outline">
								<Text>Void</Text>
							</Button>
							<Button testID="left-print" variant="ghost">
								<Text>Print bill</Text>
							</Button>
							<Button testID="left-save">
								<Text>Save</Text>
							</Button>
						</DialogFooter>
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
							<DialogFooter>
								<DialogClose testID="phone-center-cancel">
									<Text>Cancel</Text>
								</DialogClose>
								<DialogAction testID="phone-center-send">
									<Text>Send</Text>
								</DialogAction>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</View>
			</DeviceScope>
		),
	},
];
