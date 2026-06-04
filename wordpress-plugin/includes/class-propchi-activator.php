<?php
if (!defined('ABSPATH')) { exit; }

final class Propchi_Activator {
    public static function activate() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset = $wpdb->get_charset_collate();

        $api_keys = Propchi_Utils::table('gemini_keys');
        $logs = Propchi_Utils::table('request_logs');
        $cache = Propchi_Utils::table('response_cache');

        dbDelta("CREATE TABLE {$api_keys} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            name VARCHAR(190) NOT NULL DEFAULT '',
            api_key TEXT NOT NULL,
            key_preview VARCHAR(64) NOT NULL DEFAULT '',
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            weight INT UNSIGNED NOT NULL DEFAULT 1,
            request_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
            last_used_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            KEY is_active (is_active),
            KEY last_used_at (last_used_at)
        ) {$charset};");

        dbDelta("CREATE TABLE {$logs} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            telegram_id BIGINT NULL,
            message TEXT NOT NULL,
            response LONGTEXT NULL,
            source VARCHAR(32) NOT NULL DEFAULT 'database',
            status VARCHAR(32) NOT NULL DEFAULT 'success',
            ip VARCHAR(64) NULL,
            error TEXT NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            KEY telegram_id (telegram_id),
            KEY source (source),
            KEY created_at (created_at)
        ) {$charset};");

        dbDelta("CREATE TABLE {$cache} (
            cache_key CHAR(64) NOT NULL,
            response LONGTEXT NOT NULL,
            source VARCHAR(32) NOT NULL DEFAULT 'cache',
            expires_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY (cache_key),
            KEY expires_at (expires_at)
        ) {$charset};");

        $defaults = array(
            'bot_secret' => wp_generate_password(48, false, false),
            'signature_secret' => wp_generate_password(64, false, false),
            'ai_enabled' => 1,
            'database_lookup_enabled' => 1,
            'cache_enabled' => 1,
            'cache_ttl' => 300,
            'gemini_model' => 'gemini-1.5-flash',
            'system_prompt' => 'تو دستیار فارسی پراپچی هستی و فقط درباره پراپ فرم، قوانین حساب، قوانین تریدینگ، چالش‌ها و کدهای تخفیف پاسخ می‌دهی.',
            'fallback_message' => 'متأسفم، فقط می‌توانم درباره پراپ فرم‌ها، قوانین حساب و خدمات پراپچی پاسخ بدهم.',
            'disabled_message' => 'موتور هوش مصنوعی در حال حاضر غیرفعال است.',
            'allowed_tables' => "prop_firms\ndiscount_codes\npropchi_prop_firms\npropchi_discount_codes",
        );
        add_option('propchi_ai_backend_options', $defaults, '', false);
    }

    public static function deactivate() {}
}
