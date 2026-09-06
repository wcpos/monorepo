import test from 'node:test';
import assert from 'node:assert/strict';

import { getScenario, SCENARIOS, SLOW_DELAY_MS, vendorScenario } from './scenarios.mjs';

test('every scenario declares what raw 9100 does', () => {
	for (const [name, scenario] of Object.entries(SCENARIOS)) {
		assert.ok(['print', 'hold', 'closed'].includes(scenario.raw), `${name}: ${scenario.raw}`);
	}
});

test('secure printing serves ePOS over TLS only and holds raw jobs', () => {
	const scenario = getScenario('secure-printing');
	assert.equal(scenario.raw, 'hold');
	assert.equal(scenario.https.epos, 'ok');
	assert.equal(scenario.http.epos, 'off');
});

test('the office printer offers IPP and refuses raw 9100', () => {
	const scenario = getScenario('office-printer');
	assert.equal(scenario.ipp, true);
	assert.equal(scenario.raw, 'closed');
	assert.equal(scenario.http.epos, 'off');
	assert.ok(!scenario.http.webprnt);
});

test('the no-name scenario advertises no name and no TXT model', () => {
	const { mdns } = getScenario('no-name');
	assert.equal(mdns.name, '');
	assert.equal(mdns.txt, false);
});

test('the slow scenario delays every response by the documented amount', () => {
	assert.equal(getScenario('slow').delayMs, SLOW_DELAY_MS);
});

test('an unknown scenario name lists the ones that exist', () => {
	assert.throws(() => getScenario('nope'), /Unknown scenario "nope".*secure-printing/s);
});

test('an inline scenario object is passed through', () => {
	const inline = { raw: 'print' };
	assert.equal(getScenario(inline), inline);
});

test('the legacy vendor modes still map to lane configs', () => {
	assert.deepEqual(vendorScenario('star').http, { epos: 'off', webprnt: true });
	assert.deepEqual(vendorScenario('epson').http, { epos: 'ok', webprnt: false });
	assert.deepEqual(vendorScenario('both').http, { epos: 'ok', webprnt: true });
});
