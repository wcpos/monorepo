import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const target = fileURLToPath(new URL('../apps/main/e2e/ghost-ops/ghost-ops.php', import.meta.url));

const harness = String.raw`
class FakeWpdb {
	public string $prefix = 'wp_';
	public string $posts = 'wp_posts';
	public string $postmeta = 'wp_postmeta';
	public array $queries = array();

	public function prepare( $query, ...$args ) {
		if ( count( $args ) === 1 && is_array( $args[0] ) ) {
			$args = $args[0];
		}
		return array( 'query' => $query, 'args' => $args );
	}

	public function get_col( $prepared ) {
		global $post_skus;
		$needle = (string) $prepared['args'][0];
		return array_keys( array_filter( $post_skus, static fn( $sku ) => $sku === $needle ) );
	}

	public function query( $prepared ) {
		$this->queries[] = $prepared;
		return 1;
	}
}

$posts = array(
	101 => (object) array( 'post_type' => 'product', 'post_title' => 'Ghost Probe ownedg' ),
	102 => (object) array( 'post_type' => 'product', 'post_title' => 'Ghost Probe siblingg' ),
);
$post_skus = array( 101 => 'ownedg', 102 => 'siblingg' );
$deleted_ids = array();
$wpdb = new FakeWpdb();
$args = json_decode( getenv( 'GHOST_OPS_ARGS' ), true );

function get_post( $id ) {
	global $posts;
	return $posts[$id] ?? null;
}

function get_post_meta( $id, $key, $single ) {
	global $post_skus;
	return $post_skus[$id] ?? '';
}

function wp_delete_post( $id, $force ) {
	global $deleted_ids;
	$deleted_ids[] = $id;
}

include getenv( 'GHOST_OPS_TARGET' );
echo 'DELETED:' . implode( ',', $deleted_ids ) . "\n";
echo 'QUERIES:' . count( $wpdb->queries ) . "\n";
`;

function runGhostOps(...args) {
	return spawnSync('php', ['-r', harness], {
		encoding: 'utf8',
		env: {
			...process.env,
			GHOST_OPS_ARGS: JSON.stringify(args),
			GHOST_OPS_TARGET: target,
		},
	});
}

test('cleanup deletes only the probe with the exact SKU', () => {
	const result = runGhostOps('cleanup', 'ownedg');

	assert.equal(result.stderr, '');
	assert.equal(result.status, 0);
	assert.equal(result.stdout, 'CLEANED:1\nDELETED:101\nQUERIES:0\n');
});

for (const op of ['hookdelete', 'ghostdelete']) {
	test(`${op} refuses a probe owned by a different run`, () => {
		const result = runGhostOps(op, '102', 'ownedg');

		assert.equal(result.stderr, '');
		assert.equal(result.status, 0);
		assert.equal(result.stdout, 'REFUSED\nDELETED:\nQUERIES:0\n');
	});

	test(`${op} deletes the probe with the matching SKU`, () => {
		const result = runGhostOps(op, '101', 'ownedg');

		assert.equal(result.stderr, '');
		assert.equal(result.status, 0);
		assert.equal(result.stdout, `OK\nDELETED:101\nQUERIES:${op === 'ghostdelete' ? '2' : '0'}\n`);
	});
}
