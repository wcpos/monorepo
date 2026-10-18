export { protectOrderMeta } from './protected-order-meta';
export { applyLocalPatch } from './local-patch';
export { createEngineResident, CreateScopeChangedTwiceError } from './create';
export { ResidentWriteError } from './resident-write-error';
export { requestServerDelete } from './request-server-delete';
export {
	ActiveScopeChangedTwiceError,
	documentRecordId,
	findEngineResident,
	insertEngineResident,
	patchAndEnqueueEngineResident,
	patchEngineResident,
	syncableChanges,
	writeableCollection,
	type MutationDocument,
	type PayloadChanges,
	type LocalPatchProps,
} from './resident';
