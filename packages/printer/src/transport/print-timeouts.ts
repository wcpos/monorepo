/**
 * One ceiling for every print lane. The lanes used to time out at 10 s (raw TCP), 15 s (ePOS),
 * 20 s (USB/serial) and 30 s (the system dialog), so the same stalled printer produced a
 * different wait depending on how it was connected and no message could name a number.
 *
 * 20 s is the ceiling: the slowest job a merchant prints in practice is a full-receipt raster
 * over Bluetooth, which is a few seconds, and a printer that has said nothing for twenty
 * seconds is not about to answer. Probe and discovery timeouts are deliberately not this
 * value — they are scans, not jobs, and stay short.
 */
export const PRINT_JOB_TIMEOUT_MS = 20_000;

/**
 * When a job is still unsettled after this long, the queue logs one line. It sits well inside
 * PRINT_JOB_TIMEOUT_MS so a stalled printer leaves a trace before the timeout fires, and past
 * the point where a normal receipt has already come out of the printer.
 */
export const PRINT_JOB_SLOW_MS = 8_000;
