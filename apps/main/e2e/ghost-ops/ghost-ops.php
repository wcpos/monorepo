<?php
/**
 * Server-side ops for the #1284 ghost-prune live harness. DEV STORES ONLY.
 *
 * Two safety rules, both from review findings that had already caused damage:
 *
 *  1. Every stored-digest predicate is scoped by `object_type`. That table holds
 *     product, variation, customer and order rows over INDEPENDENT id spaces, so
 *     an object_id-only predicate can delete an unrelated object's digest (and
 *     make `digestrow` report another type's row as evidence about a product),
 *     corrupting the shared store's integrity baseline.
 *  2. Destructive ops only ever touch rows this harness created. `cleanup`
 *     demands a specific prefix, and nothing here selects a victim from the
 *     catalog — an earlier revision deleted real fixture product 81131 (WJ05)
 *     that way and it had to be rebuilt by hand.
 */

$op = $args[0] ?? '';
global $wpdb;
$digest_table  = $wpdb->prefix . 'wcpos_sync_stored_digest';
$product_types = array( 'product', 'variation' );

/** Delete the stored-digest rows for one PRODUCT-space id (never another id space). */
$purge_digest = static function ( int $id ) use ( $wpdb, $digest_table, $product_types ): int {
	$placeholders = implode( ',', array_fill( 0, count( $product_types ), '%s' ) );
	return (int) $wpdb->query(
		$wpdb->prepare(
			"DELETE FROM $digest_table WHERE object_id = %d AND object_type IN ($placeholders)",
			array_merge( array( $id ), $product_types )
		)
	);
};

switch ( $op ) {
	case 'storeurl': // which site is this? the harness compares it to the client's store
		echo home_url(), "\n";
		break;

	case 'create': // create <sku> [ghost] — ghost = purge the stored-digest row after a hooked save
		$p = new WC_Product_Simple();
		$p->set_name( 'Ghost Probe ' . $args[1] );
		$p->set_sku( $args[1] );
		$p->set_regular_price( '1.00' );
		$p->set_status( 'publish' );
		$id = $p->save();
		if ( ( $args[2] ?? '' ) === 'ghost' ) {
			$purge_digest( $id );
		}
		echo 'ID:' . $id . ' SLUG:' . get_post_field( 'post_name', $id ) . "\n";
		break;

	case 'hookdelete': // hookdelete <id> — normal delete; the tombstone flows to clients
		echo probe_guard( (int) $args[1] ) ? "OK\n" : "REFUSED\n";
		break;

	case 'ghostdelete': // ghostdelete <id> — delete + purge journal/digest so clients never learn
		$id = (int) $args[1];
		if ( ! probe_guard( $id ) ) {
			echo "REFUSED\n";
			break;
		}
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}wcpos_sync_journal WHERE object_type = 'product' AND object_id = %d", $id ) );
		$purge_digest( $id );
		echo "OK\n";
		break;

	case 'count':
		echo (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'product' AND post_status = 'publish'" ), "\n";
		break;

	case 'digestrow': // digestrow <id> — does a PRODUCT-space stored-digest row exist?
		$placeholders = implode( ',', array_fill( 0, count( $product_types ), '%s' ) );
		echo (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM $digest_table WHERE object_id = %d AND object_type IN ($placeholders)",
				array_merge( array( (int) $args[1] ), $product_types )
			)
		), "\n";
		break;

	case 'cleanup': // cleanup <sku-prefix> — probe SKUs only
		$prefix = (string) ( $args[1] ?? '' );
		// A short or generic prefix would force-delete real catalog fixtures, so
		// require something that can only be one of this harness's probe tokens.
		if ( ! preg_match( '/^[A-Za-z0-9]{4,}$/', $prefix ) ) {
			echo "REFUSED: cleanup needs an alphanumeric prefix of 4+ chars\n";
			break;
		}
		$ids = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_sku' AND meta_value LIKE %s",
				$wpdb->esc_like( $prefix ) . '%'
			)
		);
		$deleted = 0;
		foreach ( $ids as $pid ) {
			if ( probe_guard( (int) $pid ) ) {
				++$deleted;
			}
		}
		echo 'CLEANED:' . $deleted . "\n";
		break;

	default:
		echo "UNKNOWN OP\n";
}

/**
 * Force-delete a post ONLY if it is one of this harness's probes, identified by
 * the "Ghost Probe " title prefix its own `create` op stamps. Anything else —
 * notably a real catalog product — is refused, which is the guard the 81131
 * incident was missing.
 */
function probe_guard( int $id ): bool {
	$post = get_post( $id );
	if ( ! $post || 'product' !== $post->post_type ) {
		return false;
	}
	if ( 0 !== strpos( (string) $post->post_title, 'Ghost Probe ' ) ) {
		return false;
	}
	wp_delete_post( $id, true );

	return true;
}
