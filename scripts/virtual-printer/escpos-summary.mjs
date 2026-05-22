/**
 * Summarize received ESC/POS bytes for console output.
 * @param {ArrayLike<number>} bytes
 * @returns {string}
 */
export function summarizeEscPos(bytes) {
  const u8 = Uint8Array.from(bytes);
  const notes = [];

  if (u8.length >= 2 && u8[0] === 0x1b && u8[1] === 0x40) notes.push('init (ESC @)');

  for (let i = 0; i + 1 < u8.length; i++) {
    if (u8[i] === 0x1d && u8[i + 1] === 0x56) {
      notes.push('cut (GS V)');
      break;
    }
  }

  for (let i = 0; i + 1 < u8.length; i++) {
    if (u8[i] === 0x1b && u8[i + 1] === 0x70) {
      notes.push('drawer kick (ESC p)');
      break;
    }
  }

  return `${u8.length} bytes${notes.length ? ' — ' + notes.join(', ') : ''}`;
}
