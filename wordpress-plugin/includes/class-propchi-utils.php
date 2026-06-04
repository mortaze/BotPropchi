<?php
if (!defined('ABSPATH')) { exit; }

final class Propchi_Utils {
    public static function table($name) {
        global $wpdb;
        return $wpdb->prefix . 'propchi_' . sanitize_key($name);
    }

    public static function json_response($data, $status = 200) {
        return new WP_REST_Response($data, $status);
    }

    public static function normalize_text($text) {
        $text = wp_strip_all_tags((string) $text);
        $text = preg_replace('/\s+/u', ' ', $text);
        return trim($text);
    }

    public static function option($key, $default = null) {
        $options = get_option('propchi_ai_backend_options', array());
        return isset($options[$key]) ? $options[$key] : $default;
    }

    public static function update_option_value($key, $value) {
        $options = get_option('propchi_ai_backend_options', array());
        $options[$key] = $value;
        update_option('propchi_ai_backend_options', $options, false);
    }
}
