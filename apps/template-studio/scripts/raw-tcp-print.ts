import net from 'node:net';

export interface RawTcpWritableSocket {
	write(data: Buffer, callback?: (error?: Error) => void): boolean;
	end(): void;
}

export function sendRawTcp(host: string, port: number, data: Buffer): Promise<number> {
	return new Promise((resolve, reject) => {
		let settled = false;
		logRawTcpPrint('info', 'socket opening', {
			host,
			port,
			byteLength: data.byteLength,
			timeoutMs: 5000,
		});
		const socket = net.createConnection({ host, port, timeout: 5000 }, () => {
			logRawTcpPrint('info', 'socket connected', {
				host,
				port,
				localAddress: socket.localAddress,
				localPort: socket.localPort,
				remoteAddress: socket.remoteAddress,
				remotePort: socket.remotePort,
			});
			try {
				const bytesQueued = writeRawTcpPayload(socket, data, { host, port });
				settled = true;
				resolve(bytesQueued);
			} catch (error) {
				settled = true;
				reject(error);
			}
		});
		socket.on('error', (error) => {
			logRawTcpPrint('error', 'socket error', {
				host,
				port,
				error: error instanceof Error ? error.message : String(error),
			});
			if (!settled) {
				settled = true;
				reject(error);
			}
		});
		socket.on('close', (hadError) => {
			logRawTcpPrint('info', 'socket closed', { host, port, hadError });
		});
		socket.on('timeout', () => {
			const error = new Error('Raw TCP print timed out');
			logRawTcpPrint('error', 'socket timed out', { host, port, byteLength: data.byteLength });
			if (!settled) {
				settled = true;
				reject(error);
			}
			socket.destroy(error);
		});
	});
}

export function writeRawTcpPayload(
	socket: RawTcpWritableSocket,
	data: Buffer,
	target: { host: string; port: number }
): number {
	logRawTcpPrint('info', 'socket writing', {
		host: target.host,
		port: target.port,
		byteLength: data.byteLength,
	});
	socket.write(data, (error) => {
		if (error) {
			logRawTcpPrint('error', 'socket write failed', {
				host: target.host,
				port: target.port,
				error: error.message,
			});
			return;
		}
		logRawTcpPrint('info', 'socket write completed', {
			host: target.host,
			port: target.port,
			byteLength: data.byteLength,
		});
	});
	socket.end();
	logRawTcpPrint('info', 'socket payload queued', {
		host: target.host,
		port: target.port,
		byteLength: data.byteLength,
	});
	return data.byteLength;
}

function logRawTcpPrint(
	level: 'info' | 'warn' | 'error',
	message: string,
	details: Record<string, unknown>
): void {
	const prefix = '[template-studio raw-tcp]';
	console[level](prefix, message, details);
}
