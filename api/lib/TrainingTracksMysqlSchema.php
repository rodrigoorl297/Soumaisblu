<?php
declare(strict_types=1);

function soublu_ensure_training_tracks_tables(?PDO $pdo = null): array
{
    static $done = false;
    static $applied = [];

    if ($done) {
        return $applied;
    }

    $pdo = $pdo ?? soublu_pdo();

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `training_tracks` (
            `id` VARCHAR(64) NOT NULL,
            `title` VARCHAR(255) NOT NULL,
            `description` TEXT NULL,
            `sector` VARCHAR(128) NOT NULL DEFAULT \'\',
            `level` VARCHAR(64) NOT NULL DEFAULT \'Base\',
            `training_ids` JSON NULL,
            `audience_roles` JSON NULL,
            `partner_root_id` VARCHAR(64) NULL,
            `sort_order` INT NOT NULL DEFAULT 0,
            `active` TINYINT(1) NOT NULL DEFAULT 1,
            `created_by` VARCHAR(64) NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_trn_tracks_sector` (`sector`),
            KEY `idx_trn_tracks_active` (`active`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'training_tracks';

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `training_track_completions` (
            `id` VARCHAR(64) NOT NULL,
            `track_id` VARCHAR(64) NOT NULL,
            `user_id` VARCHAR(64) NOT NULL,
            `completed_at` DATETIME NULL,
            `certificate_code` VARCHAR(64) NULL,
            `certificate_issued_at` DATETIME NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_track_user` (`track_id`, `user_id`),
            KEY `idx_trn_track_comp_user` (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'training_track_completions';

    $done = true;
    return $applied;
}

/**
 * Progresso de aulas do curso (LMS) em training_attempts — JSON { completed: { "0_0": true, ... }, percent?: N }.
 */
function soublu_ensure_training_attempts_progress_schema(?PDO $pdo = null): array
{
    $pdo = $pdo ?? soublu_pdo();
    $added = [];
    $check = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $check->execute(['training_attempts', 'lesson_progress']);
    if ((int) $check->fetchColumn() === 0) {
        $pdo->exec('ALTER TABLE `training_attempts` ADD COLUMN `lesson_progress` JSON NULL');
        $added[] = 'training_attempts.lesson_progress';
    }
    return ['ok' => true, 'added' => $added];
}

function soublu_ensure_training_mural_image_schema(?PDO $pdo = null): array
{
    $pdo = $pdo ?? soublu_pdo();
    $added = [];
    $check = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $check->execute(['training_mural', 'image_url']);
    if ((int) $check->fetchColumn() === 0) {
        $pdo->exec('ALTER TABLE `training_mural` ADD COLUMN `image_url` VARCHAR(500) NULL');
        $added[] = 'training_mural.image_url';
    }
    return ['ok' => true, 'added' => $added];
}

/**
 * Coluna opcional: aviso exige marcação de ciência (reusa training_mural_reads).
 */
function soublu_ensure_training_mural_ciencia_schema(?PDO $pdo = null): array
{
    $pdo = $pdo ?? soublu_pdo();
    $added = [];
    $check = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $check->execute(['training_mural', 'exige_ciencia']);
    if ((int) $check->fetchColumn() === 0) {
        $pdo->exec(
            'ALTER TABLE `training_mural` ADD COLUMN `exige_ciencia` TINYINT(1) NOT NULL DEFAULT 0'
        );
        $added[] = 'training_mural.exige_ciencia';
    }
    return ['ok' => true, 'added' => $added];
}

/**
 * Engajamento do mural da empresa: lidos, curtidas e comentários.
 */
function soublu_ensure_training_mural_engagement_schema(?PDO $pdo = null): array
{
    static $done = false;
    static $applied = [];

    if ($done) {
        return $applied;
    }

    $pdo = $pdo ?? soublu_pdo();

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `training_mural_reads` (
            `id` VARCHAR(64) NOT NULL,
            `post_id` VARCHAR(64) NOT NULL,
            `user_id` VARCHAR(64) NOT NULL,
            `user_name` VARCHAR(255) NULL,
            `read_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_mural_read_post_user` (`post_id`, `user_id`),
            KEY `idx_mural_reads_post` (`post_id`),
            KEY `idx_mural_reads_user` (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'training_mural_reads';

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `training_mural_likes` (
            `id` VARCHAR(64) NOT NULL,
            `post_id` VARCHAR(64) NOT NULL,
            `user_id` VARCHAR(64) NOT NULL,
            `user_name` VARCHAR(255) NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_mural_like_post_user` (`post_id`, `user_id`),
            KEY `idx_mural_likes_post` (`post_id`),
            KEY `idx_mural_likes_user` (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'training_mural_likes';

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS `training_mural_comments` (
            `id` VARCHAR(64) NOT NULL,
            `post_id` VARCHAR(64) NOT NULL,
            `user_id` VARCHAR(64) NOT NULL,
            `user_name` VARCHAR(255) NULL,
            `body` TEXT NOT NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `active` TINYINT(1) NOT NULL DEFAULT 1,
            PRIMARY KEY (`id`),
            KEY `idx_mural_comments_post` (`post_id`),
            KEY `idx_mural_comments_user` (`user_id`),
            KEY `idx_mural_comments_active` (`active`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $applied[] = 'training_mural_comments';

    $done = true;
    return $applied;
}

function soublu_training_mural_engagement_tables_exist(?PDO $pdo = null): bool
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $pdo = $pdo ?? soublu_pdo();
    $st = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
    );
    foreach (['training_mural_reads', 'training_mural_likes', 'training_mural_comments'] as $table) {
        $st->execute([$table]);
        if ((int) $st->fetchColumn() === 0) {
            $cached = false;
            return false;
        }
    }
    $cached = true;
    return true;
}

function soublu_training_tracks_tables_exist(?PDO $pdo = null): bool
{
    $pdo = $pdo ?? soublu_pdo();
    try {
        $stmt = $pdo->query("SHOW TABLES LIKE 'training_tracks'");
        if (!$stmt || !$stmt->fetch()) {
            return false;
        }
        $stmt2 = $pdo->query("SHOW TABLES LIKE 'training_track_completions'");
        return (bool) ($stmt2 && $stmt2->fetch());
    } catch (Throwable $e) {
        return false;
    }
}
