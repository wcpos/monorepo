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
  ) {}

  async printRaw(data: Uint8Array): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error(`TCP connection to ${this.host}:${this.port} timed out`));
      }, 10000);

      const client = TcpSocket.createConnection(
        { host: this.host, port: this.port },
        () => {
          client.write(Buffer.from(data), (err) => {
            clearTimeout(timeout);
            if (err) {
              client.destroy();
              reject(err);
            } else {
              client.end(() => resolve());
            }
          });
        },
      );

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async printHtml(_html: string): Promise<void> {
    throw new Error('NetworkAdapter does not support HTML printing. Use printRaw instead.');
  }
}
