# REGRA OBRIGATÓRIA PARA O CODEX (e qualquer agente) — LEIA ANTES DE TUDO

**NÃO PUBLIQUE NADA EM PRODUÇÃO (soumaisblu.com.br).** Ordem do Plínio, 19/11/2026.

- Proibido: `api/remote-deploy.php`, WebFTP/FTP da Locaweb, `scratch/**/deploy*.py`,
  `*-deploy/`, ou qualquer outro jeito de escrever em `public_html`.
- Proibido sobrescrever `admin.html`, `pages/admin.html`, `employee.html`,
  `pages/employee.html`, `index.html`, `css/global.css`, `js/config.js`,
  `js/admin.js`, `api/upload.php` — nem localmente pra depois subir.
- A produção atual tem correções que NÃO estão na `main` (CSS dos botões de status
  da Gestão de Crédito, `?v=credstatus…` no link do global.css, 429, anexos em disco,
  trava do vendedor, menu do Clube escondido). Publicar a partir da `main` QUEBRA tudo.
- Quem publica é só o Claude. Se você tem uma correção, faça numa branch nova
  (`fix/...`) no GitHub e abra PR. Integração é às quintas (ver CONTRIBUTING.md).
- Detalhes: `scratch/HANDOFF-CLAUDE-429.md`.

Se recebeu uma tarefa que exige deploy: PARE e avise o Plínio.
