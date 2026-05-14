import * as React from 'react';

import ReceiptRasterizer, { type RasterEncodeOptions } from './receipt-rasterizer.dom';

export interface RasterizeInput {
	templateXml: string;
	receiptData: Record<string, unknown>;
	maxWidthDots: number;
	paperFrameClass: 'thermal-58' | 'thermal-80';
	encodeOptions: RasterEncodeOptions;
}

type RasterizeFn = (input: RasterizeInput) => Promise<Uint8Array>;

const RasterizeContext = React.createContext<RasterizeFn | null>(null);

interface PendingJob {
	input: RasterizeInput;
	resolve: (bytes: Uint8Array) => void;
	reject: (err: Error) => void;
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export function RasterizeProvider({ children }: { children: React.ReactNode }) {
	const [job, setJob] = React.useState<(PendingJob & { id: string }) | null>(null);
	const jobRef = React.useRef<(PendingJob & { id: string }) | null>(null);
	const jobCounter = React.useRef(0);
	const rasterizeQueue = React.useRef<Promise<void>>(Promise.resolve());
	const unmountedRef = React.useRef(false);

	const rasterize = React.useCallback<RasterizeFn>((input) => {
		const runJob = () =>
			new Promise<Uint8Array>((resolve, reject) => {
				if (unmountedRef.current) {
					reject(new Error('Rasterization cancelled: provider unmounted.'));
					return;
				}
				jobCounter.current += 1;
				const nextJob = { id: `raster-${jobCounter.current}`, input, resolve, reject };
				jobRef.current = nextJob;
				setJob(nextJob);
			});
		const queuedJob = rasterizeQueue.current.then(runJob, runJob);
		rasterizeQueue.current = queuedJob.then(
			() => undefined,
			() => undefined
		);
		return queuedJob;
	}, []);

	React.useEffect(() => {
		return () => {
			unmountedRef.current = true;
			jobRef.current?.reject(new Error('Rasterization cancelled: provider unmounted.'));
			jobRef.current = null;
		};
	}, []);

	const handleEncoded = React.useCallback(async (jobId: string, base64Bytes: string) => {
		setJob((current) => {
			if (current && current.id === jobId) {
				current.resolve(base64ToBytes(base64Bytes));
				jobRef.current = null;
				return null;
			}
			return current;
		});
	}, []);

	const handleError = React.useCallback(async (jobId: string, message: string) => {
		setJob((current) => {
			if (current && current.id === jobId) {
				current.reject(new Error(message));
				jobRef.current = null;
				return null;
			}
			return current;
		});
	}, []);

	return (
		<RasterizeContext.Provider value={rasterize}>
			{children}
			{job ? (
				<ReceiptRasterizer
					dom={{ matchContents: true, containerStyle: { width: 1, height: 1 } }}
					jobId={job.id}
					templateXml={job.input.templateXml}
					receiptData={job.input.receiptData}
					maxWidthDots={job.input.maxWidthDots}
					paperFrameClass={job.input.paperFrameClass}
					encodeOptions={job.input.encodeOptions}
					onEncoded={handleEncoded}
					onError={handleError}
				/>
			) : null}
		</RasterizeContext.Provider>
	);
}

export function useRasterize(): RasterizeFn {
	const ctx = React.useContext(RasterizeContext);
	if (!ctx) {
		throw new Error('useRasterize must be used within a RasterizeProvider');
	}
	return ctx;
}

export function useOptionalRasterize(): RasterizeFn | null {
	return React.useContext(RasterizeContext);
}
