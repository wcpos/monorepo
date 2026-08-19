<?php
// Live-verification ops for wcpos/monorepo#1284 ghost-resident test (dev-free ONLY).
$op = $args[0] ?? '';
global $wpdb;
$digest_table = $wpdb->prefix . 'wcpos_sync_stored_digest';
switch ( $op ) {
	case 'create': // create <sku> [ghost] — ghost = purge stored-digest row after hooked save
		$p = new WC_Product_Simple();
		$p->set_name( 'Ghost Probe ' . $args[1] );
		$p->set_sku( $args[1] );
		$p->set_regular_price( '1.00' );
		$p->set_status( 'publish' );
		$id = $p->save();
		if ( ( $args[2] ?? '' ) === 'ghost' ) {
			$wpdb->query( $wpdb->prepare( "DELETE FROM $digest_table WHERE object_id = %d", $id ) );
		}
		echo 'ID:' . $id . ' SLUG:' . get_post_field( 'post_name', $id ) . "\n";
		break;
	case 'hookdelete': // hookdelete <id> — normal delete, tombstone flows to clients
		wp_delete_post( (int) $args[1], true );
		echo "OK\n";
		break;
	case 'ghostdelete': // ghostdelete <id> — delete + purge journal rows so clients never learn
		$id = (int) $args[1];
		wp_delete_post( $id, true );
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}wcpos_sync_journal WHERE object_type = 'product' AND object_id = %d", $id ) );
		$wpdb->query( $wpdb->prepare( "DELETE FROM $digest_table WHERE object_id = %d", $id ) );
		echo "OK\n";
		break;
	case 'count':
		echo (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'product' AND post_status = 'publish'" ), "\n";
		break;
	case 'digestrow': // digestrow <id> — does a stored-digest row exist?
		echo (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM $digest_table WHERE object_id = %d", $args[1] ) ), "\n";
		break;
	case 'cleanup': // cleanup <sku-prefix>
		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_sku' AND meta_value LIKE %s", $wpdb->esc_like( $args[1] ) . '%' ) );
		foreach ( $ids as $pid ) { wp_delete_post( (int) $pid, true ); }
		echo 'CLEANED:' . count( $ids ) . "\n";
		break;
	default:
		echo "UNKNOWN OP\n";
}
