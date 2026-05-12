import { describe, expect, it } from 'vitest';

import { type RawTcpWritableSocket, writeRawTcpPayload } from '../../scripts/raw-tcp-print';

describe('Template Studio raw TCP printing', () => {
	it('acknowledges after queueing the payload instead of waiting for socket drain', () => {
		const events: string[] = [];
		const data = Buffer.from('print bytes');
		const socket: RawTcpWritableSocket = {
			write(_data) {
				events.push('write');
				return false;
			},
			end() {
				events.push('end');
			},
		};

		const bytesQueued = writeRawTcpPayload(socket, data, {
			host: '192.168.1.143',
			port: 9100,
		});

		expect(bytesQueued).toBe(data.byteLength);
		expect(events).toEqual(['write', 'end']);
	});
});
