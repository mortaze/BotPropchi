<?php
if (!defined('ABSPATH')) { exit; }

final class Propchi_Security {
    public static function validate(WP_REST_Request $request) {
        $settings = Propchi_Settings::all();
        $bot_secret = (string) $settings['bot_secret'];
        $signature_secret = (string) $settings['signature_secret'];
        $provided_key = (string) $request->get_header('x-propchi-bot-key');
        $signature = (string) $request->get_header('x-propchi-signature');
        $timestamp = (string) $request->get_header('x-propchi-timestamp');
        $body = $request->get_body();

        if ($bot_secret && hash_equals($bot_secret, $provided_key)) {
            return true;
        }

        if ($signature_secret && $signature && $timestamp) {
            if (abs(time() - absint($timestamp)) > 300) {
                return new WP_Error('propchi_stale_signature', 'Signature timestamp is expired.', array('status' => 401));
            }
            $expected = hash_hmac('sha256', $timestamp . '.' . $body, $signature_secret);
            if (hash_equals($expected, $signature)) {
                return true;
            }
        }

        return new WP_Error('propchi_unauthorized', 'Unauthorized Telegram Bot request.', array('status' => 401));
    }
}
