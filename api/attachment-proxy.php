<?php
/**
 * Compatibilidade: URLs antigas apontam para attachment-proxy.php?path=bucket/objeto
 * Encaminha para file.php (disco Locaweb + Supabase legado).
 */
declare(strict_types=1);

$_GET['path'] = (string) ($_GET['path'] ?? '');
require __DIR__ . '/file.php';
