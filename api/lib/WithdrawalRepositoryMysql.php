<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';

final class WithdrawalRepositoryMysql
{
    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? soublu_pdo();
    }

    public function find(string $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM withdrawals WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row ? $this->hydrate($row) : null;
    }

    public function update(string $id, array $fields): ?array
    {
        if (!$fields) {
            return $this->find($id);
        }
        $sets = [];
        $bind = ['id' => $id];
        foreach ($fields as $k => $v) {
            if (!preg_match('/^[a-zA-Z0-9_]+$/', (string) $k)) {
                continue;
            }
            $sets[] = "`{$k}` = :{$k}";
            $bind[$k] = is_bool($v) ? ($v ? 1 : 0) : $v;
        }
        $sql = 'UPDATE withdrawals SET ' . implode(', ', $sets) . ' WHERE id = :id';
        $this->pdo->prepare($sql)->execute($bind);
        return $this->find($id);
    }

    private function hydrate(array $row): array
    {
        foreach (['approved_by_master', 'approved_by_financial'] as $b) {
            if (isset($row[$b])) {
                $row[$b] = (bool) (int) $row[$b];
            }
        }
        return $row;
    }
}
