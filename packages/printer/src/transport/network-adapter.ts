import TcpSocket from 'react-native-tcp-socket';

import type { PrinterTransport } from '../types';

/**
 * React Native network adapter.
 * Sends raw ESC/POS bytes via TCP socket to port 9100.
 */
export class NetworkAdapter implements PrinterTransport {
	readonly name = 'network-native';

	constructor(
		private host: string,
		private port: number = 9100,
		_vendor?: string
	) {}

	async printRaw(data: Uint8Array): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let settled = false;
			let client: ReturnType<typeof TcpSocket.createConnection> | null = null;

			const settle = (err?: Error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				if (client) {
					client.destroy();
				}
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			};

			const timeout = setTimeout(() => {
				settle(new Error(`TCP connection to ${this.host}:${this.port} timed out`));
			}, 10000);

			try {
				client = TcpSocket.createConnection({ host: this.host, port: this.port }, () => {
					client!.write(data, undefined, ((err: any) => {
						if (err) {
							settle(err);
						} else {
							clearTimeout(timeout);
							settled = true;
							(client as any).end(() => resolve());
						}
					}) as any);
				});

				client.on('error', (err) => {
					settle(err);
				});
			} catch (err) {
				settle(err instanceof Error ? err : new Error(String(err)));
			}
		});
	}

	async printHtml(_html: string): Promise<void> {
		throw new Error('NetworkAdapter does not support HTML printing. Use printRaw instead.');
	}
}
