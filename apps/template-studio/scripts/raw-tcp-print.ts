import net from 'node:net';

export interface RawTcpWritableSocket {
	write(data: Buffer, callback?: (error?: Error) => void): boolean;
	end(): void;
}

export function sendRawTcp(host: string, port: number, data: Buffer): Promise<number> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const socket = net.createConnection({ host, port, timeout: 5000 }, () => {
			try {
				const bytesQueued = writeRawTcpPayload(socket, data, { host, port });
				settled = true;
				socket.setTimeout(0);
				resolve(bytesQueued);
			} catch (error) {
				settled = true;
				reject(error);
			}
		});
		socket.on('error', (error) => {
			if (!settled) {
				settled = true;
				reject(error);
			}
		});
		socket.on('timeout', () => {
			const error = new Error('Raw TCP print timed out');
			if (!settled) {
				settled = true;
				reject(error);
				socket.destroy(error);
			}
		});
	});
}

export function writeRawTcpPayload(
	socket: RawTcpWritableSocket,
	data: Buffer,
	_target: { host: string; port: number }
): number {
	socket.write(data);
	socket.end();
	return data.byteLength;
}
