/** Deliberate compatibility seam for legacy-shaped documents at core's engine boundary. */
export { wrapEngineDocument } from './engine-adapter/document-proxy';
export {
	adapterDerivedFieldsFor,
	engineCollectionNameFor,
	promotedColumnsFor,
	resolveLegacyField,
	type LegacyCollectionName,
} from './engine-adapter/collection-map';
