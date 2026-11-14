export {
	getSlotEntries,
	getSlotEntryComponent,
	registerSlotEntry,
	resetSlotRegistry,
	subscribeSlotRegistry,
	SLOT_API_VERSION,
} from './registry';
export { Slot, createReadonlyView, useReadonlyView, useSlotValue } from './slot';

export type {
	ReadonlyView,
	SlotContracts,
	SlotEntryDescriptor,
	SlotEntryProps,
	SlotEntryRegistration,
	SlotId,
} from './registry';
export type { SlotRenderedEntry } from './slot';
