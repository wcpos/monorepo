import * as Crypto from 'expo-crypto';

if (typeof global.crypto === 'undefined') {
  global.crypto = {
    getRandomValues: <T extends ArrayBufferView | null>(buffer: T): T => {
      if (!buffer) return buffer;
      const ints = new Uint8Array(buffer.byteLength);
      Crypto.getRandomValues(ints);
      new Uint8Array(buffer.buffer).set(ints);
      return buffer;
    },
  } as Crypto;
}
