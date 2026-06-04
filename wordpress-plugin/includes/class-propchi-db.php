<?php
if (!defined('ABSPATH')) { exit; }

final class Propchi_DB {
    public static function allowed_tables() {
        global $wpdb;
        $settings = Propchi_Settings::all();
        $raw = preg_split('/[\r\n,]+/', (string) $settings['allowed_tables']);
        $tables = array();
        foreach ($raw as $table) {
            $table = trim($table);
            if ($table === '') { continue; }
            $table = preg_replace('/[^A-Za-z0-9_]/', '', $table);
            $tables[] = strpos($table, $wpdb->prefix) === 0 ? $table : $wpdb->prefix . $table;
        }
        return array_values(array_unique(apply_filters('propchi_allowed_tables', $tables)));
    }

    public static function user_has_access($telegram_id) {
        // قابل توسعه توسط سایت میزبان؛ پیش‌فرض برای جلوگیری از قطع سرویس اجازه می‌دهد.
        return (bool) apply_filters('propchi_user_has_access', true, $telegram_id);
    }

    public static function find_answer($message) {
        global $wpdb;
        if (!Propchi_Utils::option('database_lookup_enabled', 1)) { return null; }
        $like = '%' . $wpdb->esc_like($message) . '%';
        foreach (self::allowed_tables() as $table) {
            $exists = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table));
            if (!$exists) { continue; }
            $columns = $wpdb->get_col("SHOW COLUMNS FROM `{$table}`", 0);
            $search_columns = array_values(array_intersect($columns, array('name', 'title', 'question', 'keyword', 'description', 'content')));
            $answer_columns = array_values(array_intersect($columns, array('answer', 'response', 'description', 'content', 'code')));
            if (!$search_columns || !$answer_columns) { continue; }
            $where = implode(' OR ', array_map(static fn($c) => "`{$c}` LIKE %s", $search_columns));
            $sql = "SELECT `{$answer_columns[0]}` AS answer FROM `{$table}` WHERE {$where} LIMIT 1";
            $params = array_fill(0, count($search_columns), $like);
            $answer = $wpdb->get_var($wpdb->prepare($sql, $params));
            if ($answer) { return wp_strip_all_tags($answer); }
        }
        return null;
    }

    public static function cache_get($message) {
        global $wpdb;
        if (!Propchi_Utils::option('cache_enabled', 1)) { return null; }
        $key = hash('sha256', mb_strtolower($message));
        $table = Propchi_Utils::table('response_cache');
        $row = $wpdb->get_row($wpdb->prepare("SELECT response, source FROM {$table} WHERE cache_key = %s AND expires_at > UTC_TIMESTAMP()", $key), ARRAY_A);
        return $row ?: null;
    }

    public static function cache_set($message, $response, $source) {
        global $wpdb;
        if (!Propchi_Utils::option('cache_enabled', 1)) { return; }
        $ttl = max(30, absint(Propchi_Utils::option('cache_ttl', 300)));
        $wpdb->replace(Propchi_Utils::table('response_cache'), array(
            'cache_key' => hash('sha256', mb_strtolower($message)),
            'response' => $response,
            'source' => $source,
            'expires_at' => gmdate('Y-m-d H:i:s', time() + $ttl),
            'created_at' => gmdate('Y-m-d H:i:s'),
        ));
    }

    public static function log($telegram_id, $message, $response, $source, $status = 'success', $error = '') {
        global $wpdb;
        $wpdb->insert(Propchi_Utils::table('request_logs'), array(
            'telegram_id' => $telegram_id ? (int) $telegram_id : null,
            'message' => $message,
            'response' => $response,
            'source' => $source,
            'status' => $status,
            'ip' => sanitize_text_field($_SERVER['REMOTE_ADDR'] ?? ''),
            'error' => $error,
            'created_at' => gmdate('Y-m-d H:i:s'),
        ));
    }
}
