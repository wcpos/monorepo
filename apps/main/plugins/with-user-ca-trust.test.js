const assert = require('node:assert/strict');
const test = require('node:test');

const {
	NETWORK_SECURITY_CONFIG_XML,
	setNetworkSecurityConfigAttribute,
} = require('./with-user-ca-trust');

const sampleManifest = () => ({
	manifest: {
		application: [{ $: { 'android:name': '.MainApplication' } }],
	},
});

test('sets the networkSecurityConfig attribute on the application element', () => {
	const result = setNetworkSecurityConfigAttribute(sampleManifest());
	assert.equal(
		result.manifest.application[0].$['android:networkSecurityConfig'],
		'@xml/network_security_config'
	);
	assert.equal(result.manifest.application[0].$['android:name'], '.MainApplication');
});

test('is idempotent', () => {
	const once = setNetworkSecurityConfigAttribute(sampleManifest());
	const twice = setNetworkSecurityConfigAttribute(once);
	assert.equal(
		twice.manifest.application[0].$['android:networkSecurityConfig'],
		'@xml/network_security_config'
	);
});

test('throws on a manifest without an application element', () => {
	assert.throws(
		() => setNetworkSecurityConfigAttribute({ manifest: {} }),
		/could not find <application>/
	);
});

test('the config trusts system AND user anchors, nothing else', () => {
	assert.ok(NETWORK_SECURITY_CONFIG_XML.includes('<certificates src="system" />'));
	assert.ok(NETWORK_SECURITY_CONFIG_XML.includes('<certificates src="user" />'));
	assert.ok(!NETWORK_SECURITY_CONFIG_XML.includes('debug-overrides'));
});

// A custom networkSecurityConfig replaces the dev client's stock config, and
// <base-config> without cleartextTrafficPermitted DENIES cleartext on API 28+
// — which broke Metro-served JS ("CLEARTEXT communication to localhost not
// permitted", native E2E run 33160623858). Cleartext is allowed ONLY for the
// loopback/emulator-host set React Native's own debug config uses.
test('cleartext is permitted only inside the loopback domain-config', () => {
	const base = NETWORK_SECURITY_CONFIG_XML.match(/<base-config>[\s\S]*?<\/base-config>/)[0];
	assert.ok(!base.includes('cleartextTrafficPermitted'), 'base-config must not permit cleartext');
	const domain = NETWORK_SECURITY_CONFIG_XML.match(
		/<domain-config cleartextTrafficPermitted="true">[\s\S]*?<\/domain-config>/
	);
	assert.ok(domain, 'loopback domain-config missing');
	for (const host of ['localhost', '127.0.0.1', '10.0.2.2', '10.0.3.2']) {
		assert.ok(domain[0].includes(`>${host}<`), `${host} missing from the loopback set`);
	}
	// The whole set stays scoped: exactly one domain-config, no wildcard domains.
	assert.equal(NETWORK_SECURITY_CONFIG_XML.match(/<domain-config/g).length, 1);
	assert.ok(!domain[0].includes('includeSubdomains="true"'));
});
