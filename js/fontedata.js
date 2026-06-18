/**
 * SOU+BLU — FonteData (CPF cliente/funcionário + CNPJ parceiro)
 * https://fontedata.com/docs — proxy api/fontedata.php
 */
const FonteData = {
  _lastCpf: '',
  _lastCnpj: '',
  _loading: false,

  apiUrl() {
    const c = window.SOUBLU_CONFIG || {};
    return c.FONTE_DATA_URL || (c.PIX_PHP_PAY_URL || '').replace(/pix_api\.php.*$/i, 'fontedata.php');
  },

  token() {
    const c = window.SOUBLU_CONFIG || {};
    return c.FONTE_DATA_TOKEN || c.PIX_INTERNAL_TOKEN || '';
  },

  _formatAddress(enderecos) {
    if (!Array.isArray(enderecos) || !enderecos.length) return '';
    const e = enderecos[0];
    if (typeof e === 'string') return e.trim();
    const parts = [
      e.logradouro || e.endereco || e.rua || e.street,
      e.numero || e.number,
      e.complemento,
      e.bairro,
      e.cidade || e.municipio || e.localidade,
      e.uf || e.estado,
      e.cep ? `CEP ${e.cep}` : '',
    ].filter(Boolean);
    return parts.join(', ');
  },

  _sexoToCivil(sexo) {
    const s = String(sexo || '').trim().toUpperCase();
    if (s === 'M' || s === 'MASCULINO') return 'Masculino';
    if (s === 'F' || s === 'FEMININO') return 'Feminino';
    return '';
  },

  _pickEmail(emails) {
    if (!Array.isArray(emails) || !emails.length) return '';
    for (const item of emails) {
      if (typeof item === 'string' && item.trim()) return item.trim();
      if (item && typeof item === 'object') {
        const em = item.email || item.endereco || item.valor;
        if (em && String(em).trim()) return String(em).trim();
      }
    }
    return '';
  },

  _pickPhones(telefones) {
    const out = [];
    if (!Array.isArray(telefones)) return out;
    telefones.forEach(t => {
      const n = t?.telefoneComDDD || t?.telefone || t?.numero || '';
      if (n && String(n).trim()) out.push(String(n).trim());
    });
    return out;
  },

  mapToClientFields(raw) {
    const d = raw?.data ?? raw;
    if (!d || d.error) return null;
    const phones = this._pickPhones(d.telefones);
    return {
      cpf: String(d.cpf || '').replace(/\D/g, ''),
      name: String(d.nome || '').trim(),
      phone1: phones[0] || '',
      phone2: phones[1] || '',
      email: this._pickEmail(d.emails),
      motherName: String(d.nomeMae || '').trim(),
      fatherName: String(d.nomePai || '').trim(),
      address: this._formatAddress(d.enderecos),
      civilState: this._sexoToCivil(d.sexo),
      birthDate: d.dataNascimento || '',
    };
  },

  _unwrapCnpjPayload(raw) {
    const d = raw?.data ?? raw;
    if (!d || typeof d !== 'object') return null;
    if (d.error) return null;
    return d.retorno || d.resultado || d.empresa || d;
  },

  _socioNome(s) {
    if (!s || typeof s !== 'object') return '';
    return String(
      s.nomeRepresLegal || s.nome_representante_legal || s.representanteLegal?.nome
      || s.nome || s.nome_socio || s.nomeSocio || s.nomeNomeEmpresarial
      || s.nome_nome_empresarial || s.nomeEmpresarial || ''
    ).trim();
  },

  _pickCnpjOwner(d) {
    if (!d || typeof d !== 'object') return '';
    const direct = [
      d.representante_legal, d.representanteLegal, d.nome_representante,
      d.nomeRepresentante, d.responsavel, d.nome_responsavel,
      d.nome_responsavel_legal,
    ].map(v => (typeof v === 'string' ? v : v?.nome)).find(v => v && String(v).trim());
    if (direct) return String(direct).trim();

    const socios = d.socios || d.qsa || d.quadro_societario || d.sociosQsa || [];
    if (Array.isArray(socios)) {
      for (const s of socios) {
        const rep = s?.nomeRepresLegal || s?.nome_representante_legal || s?.representanteLegal?.nome;
        if (rep && String(rep).trim()) return String(rep).trim();
      }
      for (const s of socios) {
        if (s?.isRepresentanteLegal || s?.representante_legal) {
          const n = this._socioNome(s);
          if (n) return n;
        }
      }
      for (const s of socios) {
        const qual = String(s?.qualificacao || s?.qualificacao_socio || s?.qual || '').toLowerCase();
        if (qual.includes('administrador') || qual === '49' || qual.includes('sócio-administrador')) {
          const n = this._socioNome(s);
          if (n) return n;
        }
      }
      const first = this._socioNome(socios[0]);
      if (first) return first;
    }

    const natureza = String(d.natureza_juridica || d.naturezaJuridica || '').toLowerCase();
    if (natureza.includes('empresário') || natureza.includes('empresario') || natureza.includes('213-5')) {
      return String(d.nomeEmpresarial || d.nome_empresarial || d.razao_social || '').trim();
    }
    return '';
  },

  mapToPartnerFields(raw) {
    const d = this._unwrapCnpjPayload(raw);
    if (!d) return null;
    const razao = String(
      d.razao_social || d.razaoSocial || d.nomeEmpresarial || d.nome_empresarial || ''
    ).trim();
    const fantasia = String(d.nome_fantasia || d.nomeFantasia || '').trim();
    const representante = this._pickCnpjOwner(d);
    return {
      cnpj: String(d.cnpj || d.ni || d.numeroInscricao || '').replace(/\D/g, ''),
      razao_social: razao || fantasia,
      representante_legal: representante,
      endereco: this._formatCnpjAddress(d),
      contato: this._pickCnpjPhone(d),
      email: this._pickCnpjEmail(d),
      situacao: String(d.situacao_cadastral || d.situacaoCadastral || d.situacaoCadastral?.motivo || d.situacao || '').trim(),
    };
  },

  _formatCnpjAddress(d) {
    const addr = d?.endereco || d?.endereco_completo;
    if (typeof addr === 'string' && addr.trim()) return addr.trim();
    if (addr && typeof addr === 'object') {
      return [
        addr.logradouro || addr.endereco || addr.rua,
        addr.numero, addr.complemento, addr.bairro,
        addr.municipio || addr.cidade, addr.uf,
        addr.cep ? `CEP ${addr.cep}` : '',
      ].filter(Boolean).join(', ');
    }
    return [d.logradouro, d.numero, d.complemento, d.bairro, d.municipio || d.cidade, d.uf,
      d.cep ? `CEP ${d.cep}` : ''].filter(Boolean).join(', ');
  },

  _pickCnpjEmail(d) {
    const em = d.email || d.enderecoEletronico || d.correio_eletronico;
    if (em && String(em).trim()) return String(em).trim().toLowerCase();
    return '';
  },

  _pickCnpjPhone(d) {
    const raw = d.telefone || d.telefone1 || d.ddd_telefone_1;
    if (raw && String(raw).trim()) return String(raw).trim();
    return '';
  },

  /** Certidão TJ — Cível, Criminal e Fiscal (api.fontedata.com/tj-certidao?cpf_cnpj=). */
  async lookupTjCertidao(docDigits) {
    const doc = String(docDigits || '').replace(/\D/g, '');
    if (doc.length !== 11 && doc.length !== 14) {
      return { ok: false, error: 'Informe CPF (11 dígitos) ou CNPJ (14 dígitos).' };
    }
    const url = this.apiUrl();
    const token = this.token();
    if (!url || !token) return { ok: false, error: 'Consulta não configurada (fontedata.php).' };

    this._loading = true;
    this._lastCnpj = `tj-certidao:${doc}`;
    try {
      const qs = new URLSearchParams({
        consulta: 'tj-certidao',
        cpf_cnpj: doc,
        cnpj: doc.length === 14 ? doc : '',
      });
      const res = await fetch(`${url}?${qs.toString()}`, {
        method: 'GET',
        headers: { 'X-FonteData-Token': token },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        const err = json.error || `Erro ${res.status}`;
        if (/cpf inválido/i.test(err) && doc.length === 14) {
          return { ok: false, error: 'Servidor desatualizado — envie api/fontedata.php atualizado (Certidão TJ / CNPJ).' };
        }
        return { ok: false, error: err, raw: json.raw || json.data || null };
      }
      return { ok: true, raw: json.data, consulta: 'tj-certidao', cpf_cnpj: doc };
    } catch (e) {
      return { ok: false, error: e.message || 'Falha na consulta' };
    } finally {
      this._loading = false;
    }
  },

  _cnpjQuery(cnpj, consulta) {
    const qs = new URLSearchParams({
      cnpj,
      cpf_cnpj: cnpj,
      consulta: consulta || 'consulta-cnpj-receita',
    });
    return qs.toString();
  },

  async lookupScoreQuod(cnpjDigits) {
    return this.lookupCnpj(cnpjDigits, 'score-credito-quod');
  },

  async lookupCnpj(cnpjDigits, consulta) {
    const cnpj = String(cnpjDigits || '').replace(/\D/g, '');
    if (cnpj.length !== 14) return { ok: false, error: 'CNPJ inválido (14 dígitos)' };
    const ep = consulta || 'consulta-cnpj-receita';
    if (ep === 'tj-certidao') return this.lookupTjCertidao(cnpj);
    const cacheKey = `${ep}:${cnpj}`;
    if (this._loading && this._lastCnpj === cacheKey) return { ok: false, error: 'Aguarde…' };

    const url = this.apiUrl();
    const token = this.token();
    if (!url || !token) return { ok: false, error: 'Consulta não configurada (fontedata.php).' };

    this._loading = true;
    this._lastCnpj = cacheKey;
    try {
      const res = await fetch(`${url}?${this._cnpjQuery(cnpj, ep)}`, {
        method: 'GET',
        headers: { 'X-FonteData-Token': token },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        const err = json.error || `Erro ${res.status}`;
        if (/cpf inválido/i.test(err)) {
          return { ok: false, error: 'Servidor desatualizado — envie api/fontedata.php atualizado (consulta CNPJ).' };
        }
        return { ok: false, error: err };
      }
      if (ep === 'consulta-cnpj-receita') {
        const mapped = this.mapToPartnerFields(json);
        if (!mapped?.razao_social) return { ok: false, error: 'Nenhum dado encontrado para este CNPJ.' };
        return { ok: true, partner: mapped, raw: json.data };
      }
      return { ok: true, raw: json.data, consulta: ep };
    } catch (e) {
      return { ok: false, error: e.message || 'Falha na consulta' };
    } finally {
      this._loading = false;
    }
  },

  async lookupCpf(cpfDigits) {
    const cpf = String(cpfDigits || '').replace(/\D/g, '');
    if (cpf.length !== 11) return { ok: false, error: 'CPF inválido' };
    if (this._loading && this._lastCpf === cpf) return { ok: false, error: 'Aguarde…' };

    const url = this.apiUrl();
    const token = this.token();
    if (!url || !token) {
      return { ok: false, error: 'Consulta CPF não configurada no servidor (fontedata.php).' };
    }

    this._loading = true;
    this._lastCpf = cpf;
    try {
      const res = await fetch(`${url}?cpf=${encodeURIComponent(cpf)}`, {
        method: 'GET',
        headers: { 'X-FonteData-Token': token },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        return { ok: false, error: json.error || `Erro ${res.status}` };
      }
      const mapped = this.mapToClientFields(json);
      if (!mapped?.name) {
        return { ok: false, error: 'Nenhum dado encontrado para este CPF.' };
      }
      return { ok: true, client: mapped, raw: json.data };
    } catch (e) {
      return { ok: false, error: e.message || 'Falha na consulta' };
    } finally {
      this._loading = false;
    }
  },
};

window.FonteData = FonteData;
