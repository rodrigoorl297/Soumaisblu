<?php
declare(strict_types=1);

/**
 * lp-partner-archive — arquivamento automático de Aprovados/Excluídos após 72h.
 * Portado de landingPageBlu (partner-archive.php) para o monorepo SOU+BLU.
 */

const LP_PARTNER_ARCHIVE_SECONDS = 3 * 24 * 60 * 60;

/**
 * partnerArchiveDueAt — data prevista de arquivamento (ou null se não se aplica).
 */
function partnerArchiveDueAt(array $record): ?DateTimeImmutable
{
    if (!in_array($record['status'] ?? '', ['aprovado', 'recusado'], true) || !empty($record['archived_at'])) {
        return null;
    }
    $started = $record['status_updated_at'] ?? null;
    if (!$started) {
        return null;
    }
    try {
        $date = new DateTimeImmutable((string) $started);
        return $date->setTimestamp($date->getTimestamp() + LP_PARTNER_ARCHIVE_SECONDS);
    } catch (Exception $error) {
        return null;
    }
}

/**
 * archiveExpiredPartners — arquiva vencidos; inicializa status_updated_at em antigos.
 */
function archiveExpiredPartners(PDO $pdo, ?DateTimeImmutable $now = null): int
{
    $now = $now ?? new DateTimeImmutable();
    $rows = $pdo->query(
        "SELECT id, status, status_updated_at, archived_at FROM lp_parceiros
         WHERE status IN ('aprovado', 'recusado') AND archived_at IS NULL"
    )->fetchAll(PDO::FETCH_ASSOC);

    $initialize = $pdo->prepare(
        "UPDATE lp_parceiros SET status_updated_at = :started
         WHERE id = :id AND status = :status
           AND (status_updated_at IS NULL OR status_updated_at = '') AND archived_at IS NULL"
    );
    $archive = $pdo->prepare(
        'UPDATE lp_parceiros SET archived_at = :archived
         WHERE id = :id AND status = :status AND status_updated_at = :started AND archived_at IS NULL'
    );

    $count = 0;
    foreach ($rows as $row) {
        if (empty($row['status_updated_at'])) {
            $initialize->execute([
                'started' => $now->format(DATE_ATOM),
                'id' => $row['id'],
                'status' => $row['status'],
            ]);
            continue;
        }
        $due = partnerArchiveDueAt($row);
        if (!$due || $due > $now) {
            continue;
        }
        $archive->execute([
            'archived' => $due->format(DATE_ATOM),
            'id' => $row['id'],
            'status' => $row['status'],
            'started' => $row['status_updated_at'],
        ]);
        $count += $archive->rowCount();
    }
    return $count;
}
