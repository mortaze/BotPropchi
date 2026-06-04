<?php
if (!defined('ABSPATH')) { exit; }

final class Propchi_Settings {
    public static function init() {
        add_action('admin_init', array(__CLASS__, 'register'));
    }

    public static function register() {
        register_setting('propchi_ai_backend', 'propchi_ai_backend_options', array(
            'type' => 'array',
            'sanitize_callback' => array(__CLASS__, 'sanitize'),
            'default' => array(),
        ));
    }

    public static function sanitize($input) {
        $old = get_option('propchi_ai_backend_options', array());
        $out = is_array($old) ? $old : array();
        $text_fields = array('bot_secret', 'signature_secret', 'gemini_model', 'system_prompt', 'fallback_message', 'disabled_message', 'allowed_tables');
        foreach ($text_fields as $field) {
            if (isset($input[$field])) {
                $out[$field] = $field === 'allowed_tables' ? sanitize_textarea_field($input[$field]) : sanitize_text_field($input[$field]);
            }
        }
        $out['ai_enabled'] = empty($input['ai_enabled']) ? 0 : 1;
        $out['database_lookup_enabled'] = empty($input['database_lookup_enabled']) ? 0 : 1;
        $out['cache_enabled'] = empty($input['cache_enabled']) ? 0 : 1;
        $out['cache_ttl'] = max(30, absint($input['cache_ttl'] ?? 300));
        return $out;
    }

    public static function all() {
        return wp_parse_args(get_option('propchi_ai_backend_options', array()), array(
            'bot_secret' => '',
            'signature_secret' => '',
            'ai_enabled' => 0,
            'database_lookup_enabled' => 1,
            'cache_enabled' => 1,
            'cache_ttl' => 300,
            'gemini_model' => 'gemini-1.5-flash',
            'system_prompt' => '',
            'fallback_message' => 'پاسخی برای این درخواست موجود نیست.',
            'disabled_message' => 'AI Engine غیرفعال است.',
            'allowed_tables' => '',
        ));
    }
}
