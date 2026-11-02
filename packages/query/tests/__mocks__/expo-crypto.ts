import { createHash } from 'node:crypto';

export const CryptoDigestAlgorithm = { SHA256: 'sha256' };
export const CryptoEncoding = { HEX: 'hex' };
export async function digestStringAsync(_algorithm: string, data: string) {
	return createHash('sha256').update(data).digest('hex');
}
