/**
 * SOU+BLU — Nova TI (Nova Vida NVCHECKJson)
 * Proxy: api/novati.php — usado no cadastro de cliente (CPF).
 */
const NovaTI = {
  _lastCpf: '',
  _loading: false,

  apiUrl() {
    const c = window.SOUBLU_CONFIG || {};
    return c.NOVA_TI_URL || (c.PIX_PHP_PAY_URL || '').replace(/pix_api\.php.*$/i, 'novati.php');
  },

  token() {
    const c = window.SOUBLU_CONFIG || {};
    return c.NOVA_TI_TOKEN || c.FONTE_DATA_TOKEN || c.PIX_INTERNAL_TOKEN || '';
  },

  /**
   * mapToClientFields — adapta resposta do proxy ao formulário de cliente.
   */
  mapToClientFields(raw) {
    const d = raw?.client || raw?.data?.client || raw?.data || raw;
    if (!d || typeof d !== 'object') return null;
    if (d.error) return null;
    return {
      cpf: String(d.cpf || '').replace(/\D/g, ''),
      name: String(d.name || d.nome || '').trim(),
      rg: String(d.rg || '').trim(),
      phone1: String(d.phone1 || d.telefone1 || '').replace(/\D/g, ''),
      phone2: String(d.phone2 || d.telefone2 || '').replace(/\D/g, ''),
      email: String(d.email || '').trim(),
      motherName: String(d.motherName || d.nome_mae || d.nomeMae || '').trim(),
      fatherName: String(d.fatherName || d.nome_pai || d.nomePai || '').trim(),
      address: String(d.address || d.endereco || '').trim(),
      civilState: String(d.civilState || d.estadoCivil || d.civilState || '').trim(),
      birthDate: String(d.birthDate || d.data_nascimento || '').trim(),
      situacao_cadastral: String(d.situacao_cadastral || d.situacaoCadastral || '').trim(),
    };
  },

  /**
   * lookupCpf — consulta cadastral básica (NVCHECK) para preencher o modal de cliente.
   */
  async lookupCpf(cpfDigits) {
    const cpf = String(cpfDigits || '').replace(/\D/g, '');
    if (cpf.length !== 11) return { ok: false, error: 'CPF inválido' };
    if (this._loading && this._lastCpf === cpf) return { ok: false, error: 'Aguarde…' };

    const url = this.apiUrl();
    const token = this.token();
    if (!url || !token) {
      return { ok: false, error: 'Consulta CPF não configurada no servidor (novati.php).' };
    }

    this._loading = true;
    this._lastCpf = cpf;
    try {
      const res = await fetch(`${url}?cpf=${encodeURIComponent(cpf)}`, {
        method: 'GET',
        headers: { 'X-NovaTi-Token': token },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        return { ok: false, error: json.error || `Erro ${res.status}` };
      }
      const mapped = this.mapToClientFields(json);
      if (!mapped?.name) {
        return { ok: false, error: 'Nenhum dado encontrado para este CPF.' };
      }
      return { ok: true, client: mapped, raw: json.data || json.raw };
    } catch (e) {
      return { ok: false, error: e.message || 'Falha na consulta' };
    } finally {
      this._loading = false;
    }
  },
};

window.NovaTI = NovaTI;
