/**
 * mural-upload-fix — POST cru fatiado (WAF zera multipart/POST grande).
 * Também cobre anexos de proposta: FormData some (UPLOAD_ERR_NO_TMP_DIR).
 */
(function () {
  const CHUNK = 12000;

  function randId() {
    const a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  /**
   * safeFileName — nome original sanitizado (PDF/JPG), não força foto.png.
   * Só [A-Za-z0-9._-]: upload.php recusa espaço, (), + etc. com "Caminho inválido".
   */
  function safeFileName(file) {
    const raw = String((file && file.name) || 'arquivo.bin');
    const dot = raw.lastIndexOf('.');
    const ext = dot > 0 ? raw.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase() : '';
    const stem = (dot > 0 ? raw.slice(0, dot) : raw)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_-]+|[_-]+$/g, '')
      .slice(0, 70) || 'arquivo';
    return ext ? stem + '.' + ext : stem;
  }

  /**
   * soubluRawUpload — POST cru (ou fatiado) para api/upload.php.
   */
  async function soubluRawUpload(file, bucket, subPath) {
    const cfg = window.SOUBLU_CONFIG || {};
    const base = cfg.UPLOAD_URL || (String(location.origin || '') + '/api/upload.php');
    if (!base || !file) return null;
    const buf = new Uint8Array(await file.arrayBuffer());
    const chunks = Math.max(1, Math.ceil(buf.length / CHUNK));
    const id = randId();
    const filename = safeFileName(file);
    const type = file.type || 'application/octet-stream';
    let last = {};
    for (let i = 0; i < chunks; i++) {
      const part = buf.subarray(i * CHUNK, Math.min(buf.length, (i + 1) * CHUNK));
      const q = new URLSearchParams({
        bucket: String(bucket || 'misc'),
        path: String(subPath || ''),
        filename: filename,
      });
      if (chunks > 1) {
        q.set('chunk', String(i));
        q.set('chunks', String(chunks));
        q.set('upload_id', id);
      }
      const res = await fetch(base + '?' + q.toString(), {
        method: 'POST',
        headers: {
          'X-API-Key': cfg.API_KEY || '',
          'Content-Type': type,
          'X-File-Name': filename,
        },
        body: new Blob([part], { type: type }),
      });
      last = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(last.error || ('HTTP ' + res.status));
    }
    const rel = String(last.caminho || last.path || last.url || '').replace(/^\/uploads\//, '').replace(/^\//, '');
    if (!rel) throw new Error(last.error || 'Upload sem URL');
    return rel;
  }

  window.soubluRawUpload = soubluRawUpload;

  function installUploadImage() {
    if (window.__soubluRawUploadFixInstalled) return true;
    if (typeof window.uploadImage !== 'function') return false;
    window.__soubluRawUploadFixInstalled = true;
    const prev = window.uploadImage;
    window.uploadImage = async function (file, bucket, subPath) {
      try {
        const rel = await soubluRawUpload(file, bucket, subPath);
        if (rel) return rel;
      } catch (e) {
        console.warn('[upload-fix]', e && e.message ? e.message : e);
      }
      return prev.apply(this, arguments);
    };
    return true;
  }

  /**
   * installProposal — troca FormData de DB.uploadProposalFile pelo POST fatiado.
   */
  function installProposal() {
    if (window.__soubluProposalUploadFix) return true;
    if (!window.DB || typeof window.DB.uploadProposalFile !== 'function') return false;
    window.__soubluProposalUploadFix = true;
    const prev = window.DB.uploadProposalFile.bind(window.DB);
    window.DB.uploadProposalFile = async function (file, proposalId, grupo) {
      if (!file) throw new Error('Arquivo inválido.');
      const safePid = String(proposalId || 'new').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
      const safeGrp = String(grupo || 'doc').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
      const origName = file.name || 'arquivo';
      const storageName = safeFileName(file);
      const path = safePid + '/' + safeGrp + '/' + Date.now() + '_' + storageName;
      try {
        const rel = await soubluRawUpload(file, 'proposal-attachments', path);
        if (rel) {
          const caminho = typeof this.normalizeProposalCaminho === 'function'
            ? this.normalizeProposalCaminho(rel)
            : String(rel).replace(/^\/+/, '');
          return {
            url: rel,
            caminho: caminho,
            nome: origName,
            public_url: null,
          };
        }
      } catch (e) {
        console.warn('[upload-fix proposal]', e && e.message ? e.message : e);
      }
      return prev(file, proposalId, grupo);
    };
    return true;
  }

  function install() {
    installUploadImage();
    installProposal();
    return window.__soubluRawUploadFixInstalled && window.__soubluProposalUploadFix;
  }

  if (!install()) {
    document.addEventListener('DOMContentLoaded', install);
    window.addEventListener('load', install);
    let n = 0;
    const t = setInterval(function () {
      n += 1;
      if (install() || n > 40) clearInterval(t);
    }, 250);
  }
})();
