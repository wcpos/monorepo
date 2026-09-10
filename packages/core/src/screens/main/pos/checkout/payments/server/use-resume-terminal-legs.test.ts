import { resumableTerminalRow } from './use-resume-terminal-legs';
import { row } from '../device/fixtures.test-utils';
jest.mock('@wcpos/query', () => ({ useRecordField: jest.fn() }));
it.each([
	['server', 'pending', false, true],
	['server', 'authorized', false, true],
	['device', 'authorized', false, true],
	['device', 'pending', false, true],
	['device', 'authorized', true, false],
	['device', 'captured', false, false],
	['device', 'failed', false, false],
	['manual', 'pending', false, false],
] as const)('resume rule %s %s offline=%s', (capture_mode, status, recorded_offline, expected) => {
	expect(resumableTerminalRow({ ...row, capture_mode, status, recorded_offline })).toBe(expected);
});
