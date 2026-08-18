export {
	createBurstAssembler,
	type BurstAssembler,
	type BurstAssemblerOptions,
} from './burst-assembler';
export { isWebSerialSupported, isWebHidSupported } from './capabilities';
export {
	createSerialLineDecoder,
	type SerialLineDecoder,
	type SerialLineDecoderOptions,
} from './serial-line-decoder';
export { decodeHidPosReport, type HidPosDecodeOptions, type HidPosResult } from './hid-pos-decoder';
export {
	createScanSession,
	hasValidRetailCheckDigit,
	type ScanSession,
	type ScanSessionOptions,
	type ScanOfferResult,
	type ScanRejectReason,
} from './scan-session';
export {
	createWedgeDetector,
	createWedgeState,
	foldWedgeKey,
	replayWedgeDetector,
	stripBoundary,
	type TraceKey,
	type WedgeDetector,
	type WedgeDetectorOptions,
	type WedgeReplayResult,
	type WedgeSettings,
	type WedgeState,
} from './wedge-detector';
export {
	createScanBus,
	type ScanBus,
	type ScanEvent,
	type ScanSource,
	type ScanSourceKind,
} from './scan-events';
export {
	analyzeScanTrace,
	type ScanTraceSettings,
	type TraceAnalysis,
	type TraceSuggestion,
} from './analyze-trace';
