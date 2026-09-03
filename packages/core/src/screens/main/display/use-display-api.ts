import * as React from 'react';

import { unwrapResponseEnvelope, useRestHttpClient } from '../hooks/use-rest-http-client';

import type {
	DisplayPairing,
	DisplaySignalMessage,
	DisplaySignalsResponse,
	PairedDisplay,
	PostedDisplaySignal,
} from './types';

function responseData<T>(response: unknown): T {
	return (unwrapResponseEnvelope(response) as { data: T }).data;
}

export function useDisplayApi() {
	const http = useRestHttpClient('display');

	return React.useMemo(
		() => ({
			async createPairing(deviceId: string): Promise<DisplayPairing> {
				return responseData(await http.post('pairings', { device_id: deviceId }));
			},
			async listDisplays(deviceId: string): Promise<PairedDisplay[]> {
				return responseData(await http.get('displays', { params: { device_id: deviceId } }));
			},
			async forgetDisplay(id: string): Promise<void> {
				responseData(await http.delete(`displays/${id}`));
			},
			async readSignals(id: string, since: number): Promise<DisplaySignalsResponse> {
				return responseData(
					await http.get(`displays/${id}/signal`, { params: { for: 'pos', since } })
				);
			},
			async postSignal(id: string, message: DisplaySignalMessage): Promise<PostedDisplaySignal> {
				return responseData(await http.post(`displays/${id}/signal`, message));
			},
		}),
		[http]
	);
}
