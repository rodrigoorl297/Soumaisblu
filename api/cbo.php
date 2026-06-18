<?php
/**
 * API CBO — busca ocupações (tabela rh_cbo ou fallback estático).
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$q = trim((string) ($_GET['q'] ?? ''));
$limit = min(50, max(1, (int) ($_GET['limit'] ?? 20)));

if (mb_strlen($q) < 2) {
    echo json_encode(['ok' => true, 'rows' => []], JSON_UNESCAPED_UNICODE);
    exit;
}

$rows = [];

try {
    $pdo = soublu_pdo();
    $stmt = $pdo->prepare(
        'SELECT codigo, titulo FROM rh_cbo
         WHERE codigo LIKE :q OR titulo LIKE :qt
         ORDER BY codigo ASC LIMIT ' . (int) $limit
    );
    $like = '%' . $q . '%';
    $stmt->execute([':q' => $like, ':qt' => $like]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
} catch (Throwable $e) {
    // fallback offline mínimo
    $fallback = [
        ['codigo' => '411010', 'titulo' => 'Assistente administrativo'],
        ['codigo' => '521110', 'titulo' => 'Vendedor de comércio varejista'],
        ['codigo' => '252105', 'titulo' => 'Administrador'],
        ['codigo' => '354120', 'titulo' => 'Agente de vendas de serviços'],
        ['codigo' => '411005', 'titulo' => 'Auxiliar de escritório'],
    ];
    $qLower = mb_strtolower($q);
    foreach ($fallback as $item) {
        if (str_contains($item['codigo'], $q) || str_contains(mb_strtolower($item['titulo']), $qLower)) {
            $rows[] = $item;
        }
    }
}

echo json_encode(['ok' => true, 'rows' => $rows], JSON_UNESCAPED_UNICODE);
