/**
 * SOU+BLU — FonteData (CNPJ, certidões TJ, score Quod) + Nova Vida (CPF cadastral).
 * CPF → Nova Vida NVCHECK (api/novati.php) — mais barato que FonteData.
 * CNPJ/TJ/ccd → FonteData (api/fontedata.php) — sem equivalente na Nova Vida.
 */
const FonteData = {
  _lastCpf: '',
  _lastCnpj: '',
  _loading: false,

  /** Endpoints PF que passam pela Nova Vida (NVCHECK) em vez da FonteData. */
  _NOVA_TI_CPF_CONSULTAS: new Set([
    'dados-cadastrais-basicos',
    'cadastro-pf-basica',
    'receita-federal-pf',
    'cadastro-rf-pf',
  ]),

  /**
   * _cpfViaNovaTI — CPF cadastral usa Nova Vida quando novati.js está no painel.
   */
  _cpfViaNovaTI() {
    return typeof NovaTI !== 'undefined' && typeof NovaTI.lookupCpf === 'function';
  },

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

  _unwrapPayload(raw) {
    const d = raw?.data ?? raw;
    if (!d || typeof d !== 'object') return null;
    if (d.error) return null;
    return d.retorno || d.resultado || d.receita || d.cadastro || d;
  },

  _firstStr(...vals) {
    for (const v of vals) {
      const s = v == null ? '' : String(v).trim();
      if (s) return s;
    }
    return '';
  },

  mapReceitaFederalPf(raw) {
    const root = raw?.data ?? raw;
    const d = root?.receita || root?.retorno || root?.resultado || this._unwrapPayload(raw) || {};
    const nome = this._firstStr(
      d.nomePessoaFisica, d.nome_pessoa_fisica, d.nome, d.nomeSocial, d.nome_social
    );
    const situacao = this._firstStr(
      d.situacaoCadastral, d.situacao_cadastral, d.situacao, d.status
    );
    const nasc = this._firstStr(d.dataNascimento, d.data_nascimento, d.nascimento);
    const cpf = String(d.numeroCPF || d.cpf || d.numero_cpf || '').replace(/\D/g, '');
    return {
      cpf,
      nome,
      situacao_cadastral: situacao,
      data_nascimento: nasc,
      data_inscricao: this._firstStr(d.dataInscricao, d.data_inscricao),
      codigo_controle: this._firstStr(d.codigoControle, d.codigo_controle, d.codigoControleComprovante),
      digito_verificador: this._firstStr(d.digitoVerificador, d.digito_verificador),
    };
  },

  mapPisTrabalho(raw) {
    const d = this._unwrapPayload(raw) || {};
    const pis = this._firstStr(
      d.pis, d.numeroPis, d.numero_pis, d.nis, d.pisPasep, d.pis_pasep, d.numeroPisPasep
    ).replace(/\D/g, '');
    return {
      pis,
      pis_formatado: pis ? pis.replace(/^(\d{3})(\d{5})(\d{2})$/, '$1.$2.$3-$4') : '',
      situacao: this._firstStr(d.situacao, d.situacaoCadastral, d.situacao_cadastral, d.status),
      nome: this._firstStr(d.nome, d.nomeTrabalhador, d.nome_trabalhador),
      data_nascimento: this._firstStr(d.dataNascimento, d.data_nascimento),
      data_cadastro: this._firstStr(d.dataCadastro, d.data_cadastro),
      mensagem: this._firstStr(d.mensagem, d.message, d.observacao),
    };
  },

  async lookupCpfConsulta(cpfDigits, consulta, opts = {}) {
    const cpf = String(cpfDigits || '').replace(/\D/g, '');
    if (cpf.length !== 11) return { ok: false, error: 'CPF inválido (11 dígitos)' };

    const ep = consulta || 'dados-cadastrais-basicos';
    if (ep === 'pis-trabalho') {
      return { ok: false, error: 'Consulta PIS não disponível via Nova Vida (use NVCHECK).' };
    }
    if (this._NOVA_TI_CPF_CONSULTAS.has(ep) && this._cpfViaNovaTI()) {
      if (ep === 'receita-federal-pf' || ep === 'cadastro-rf-pf') {
        return this.lookupReceitaFederalPf(cpfDigits, opts.dataNascimento);
      }
      const basico = await this.lookupCpf(cpfDigits);
      if (!basico.ok) return basico;
      return { ok: true, raw: basico.raw, consulta: ep, cpf, provider: 'novati' };
    }

    const url = this.apiUrl();
    const token = this.token();
    if (!url || !token) {
      return { ok: false, error: 'Consulta não configurada (fontedata.php).' };
    }

    const qs = new URLSearchParams({ cpf, consulta: consulta || 'dados-cadastrais-basicos' });
    const dn = String(opts.dataNascimento || '').trim();
    if (dn) {
      qs.set('data_nascimento', dn);
      qs.set('dataNascimento', dn);
    }

    const slowConsultas = ['ccd-pf', 'ccd-pj', 'tj-certidao', 'trf-certidao', 'mpf-certidao'];
    const timeoutMs = Number(opts.timeoutMs) || (slowConsultas.includes(ep) ? 130000 : 60000);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const res = await fetch(`${url}?${qs.toString()}`, {
        method: 'GET',
        headers: { 'X-FonteData-Token': token },
        signal: controller ? controller.signal : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        return { ok: false, error: json.error || `Erro ${res.status}`, raw: json.raw || json.data || null };
      }
      return { ok: true, raw: json.data, consulta: ep, cpf };
    } catch (e) {
      if (e && e.name === 'AbortError') {
        return { ok: false, error: 'Consulta expirou — tente novamente.' };
      }
      return { ok: false, error: e.message || 'Falha na consulta' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  async lookupReceitaFederalPf(cpfDigits, dataNascimento) {
    if (this._cpfViaNovaTI()) {
      const res = await this.lookupCpf(cpfDigits);
      if (!res.ok) return res;
      const c = res.client || {};
      const mapped = {
        cpf: String(c.cpf || cpfDigits || '').replace(/\D/g, ''),
        nome: String(c.name || '').trim(),
        situacao_cadastral: String(c.situacao_cadastral || '').trim(),
        data_nascimento: String(c.birthDate || dataNascimento || '').trim(),
        data_inscricao: '',
        codigo_controle: '',
        digito_verificador: '',
      };
      if (!mapped.nome && !mapped.situacao_cadastral) {
        return { ok: false, error: 'Nenhum dado cadastral para este CPF (Nova Vida).', raw: res.raw };
      }
      return { ok: true, receita: mapped, raw: res.raw, provider: 'novati' };
    }
    const res = await this.lookupCpfConsulta(cpfDigits, 'receita-federal-pf', { dataNascimento });
    if (!res.ok) return res;
    const mapped = this.mapReceitaFederalPf({ data: res.raw });
    if (!mapped.nome && !mapped.situacao_cadastral) {
      return { ok: false, error: 'Nenhum dado da Receita Federal para este CPF.', raw: res.raw };
    }
    return { ok: true, receita: mapped, raw: res.raw };
  },

  async lookupPisTrabalho(cpfDigits, dataNascimento) {
    if (this._cpfViaNovaTI()) {
      return { ok: false, error: 'Consulta PIS não disponível via Nova Vida (use NVCHECK).' };
    }
    const res = await this.lookupCpfConsulta(cpfDigits, 'pis-trabalho', { dataNascimento });
    if (!res.ok) return res;
    const mapped = this.mapPisTrabalho({ data: res.raw });
    if (!mapped.pis && !mapped.situacao && !mapped.nome) {
      return { ok: false, error: 'Nenhum dado de PIS encontrado para este CPF.', raw: res.raw };
    }
    return { ok: true, pis: mapped, raw: res.raw };
  },

  mapScoreCredito(raw) {
    const d = this._unwrapPayload(raw) || {};
    return {
      cpf: String(d.cpf || d.numeroCPF || d.numero_cpf || '').replace(/\D/g, ''),
      nome: this._firstStr(d.nome, d.name, d.nomePessoaFisica, d.nome_pessoa_fisica),
      score: this._firstStr(d.score, d.scoreCredito, d.pontuacao, d.nota, d.valorScore, d.score_quod),
      classificacao: this._firstStr(d.rating, d.classificacao, d.faixa, d.risco, d.nivel_risco, d.classificacaoRisco),
      situacao: this._firstStr(d.situacao, d.status, d.situacao_cadastral, d.situacaoCadastral),
      mensagem: this._firstStr(d.mensagem, d.message, d.descricao, d.observacao),
    };
  },

  async lookupScoreCreditoPf(cpfDigits) {
    // Score Quod na FonteData é consulta CNPJ — não disponível para CPF.
    return { ok: false, error: 'Score Quod disponível apenas para CNPJ (parceiros).' };
  },

  /**
   * Análise de crédito PF — Receita Federal + PIS + cadastro básico.
   */
  async lookupAnaliseCreditoPf(cpfDigits, dataNascimento) {
    const cpf = String(cpfDigits || '').replace(/\D/g, '');
    if (cpf.length !== 11) return { ok: false, error: 'CPF inválido (11 dígitos)' };

    const dn = String(dataNascimento || '').trim();
    const rh = await this.lookupRhPerson(cpf, dn).catch((e) => ({ ok: false, error: e.message }));

    const anyOk = rh.ok;
    if (!anyOk) {
      const err = rh.error || 'Nenhuma consulta retornou dados.';
      return { ok: false, error: err, rh, score: null };
    }
    return { ok: true, rh, score: null };
  },

  /**
   * Consulta cadastro básico + Receita Federal PF + PIS (RH / currículo).
   */
  async lookupRhPerson(cpfDigits, dataNascimento) {
    const cpf = String(cpfDigits || '').replace(/\D/g, '');
    if (cpf.length !== 11) return { ok: false, error: 'CPF inválido (11 dígitos)' };

    const dn = String(dataNascimento || '').trim();

    // Uma consulta NVCHECK (Nova Vida) substitui 3 chamadas FonteData no RH.
    if (this._cpfViaNovaTI()) {
      const basico = await this.lookupCpf(cpf).catch((e) => ({ ok: false, error: e.message }));
      const receita = basico.ok
        ? {
          ok: true,
          receita: {
            cpf,
            nome: basico.client?.name || '',
            situacao_cadastral: basico.client?.situacao_cadastral || '',
            data_nascimento: basico.client?.birthDate || dn,
          },
          raw: basico.raw,
          provider: 'novati',
        }
        : { ok: false, error: basico.error || 'Sem dados cadastrais.' };
      const pis = { ok: false, error: 'PIS não consultado (Nova Vida / NVCHECK).' };
      if (!basico.ok) {
        return { ok: false, error: basico.error || 'Nenhuma consulta retornou dados.', basico, receita, pis };
      }
      return { ok: true, basico, receita, pis, provider: 'novati' };
    }

    const [basico, receita, pis] = await Promise.all([
      this.lookupCpf(cpf).catch((e) => ({ ok: false, error: e.message })),
      this.lookupReceitaFederalPf(cpf, dn).catch((e) => ({ ok: false, error: e.message })),
      this.lookupPisTrabalho(cpf, dn).catch((e) => ({ ok: false, error: e.message })),
    ]);

    const anyOk = basico.ok || receita.ok || pis.ok;
    if (!anyOk) {
      const err = receita.error || pis.error || basico.error || 'Nenhuma consulta retornou dados.';
      return { ok: false, error: err, basico, receita, pis };
    }

    return { ok: true, basico, receita, pis };
  },

  formatRhConsultaSummary(bundle) {
    if (!bundle || !bundle.ok) return '';
    const lines = [];
    if (bundle.receita?.ok && bundle.receita.receita) {
      const r = bundle.receita.receita;
      lines.push(`<strong>Receita Federal:</strong> ${r.nome || '—'} · Situação: ${r.situacao_cadastral || '—'}`);
      if (r.data_nascimento) lines.push(`Nascimento (RF): ${r.data_nascimento}`);
    } else if (bundle.receita && !bundle.receita.ok) {
      lines.push(`<span style="color:#b45309;">Receita Federal: ${bundle.receita.error || 'indisponível'}</span>`);
    }
    if (bundle.pis?.ok && bundle.pis.pis) {
      const p = bundle.pis.pis;
      lines.push(`<strong>PIS:</strong> ${p.pis_formatado || p.pis || '—'}${p.situacao ? ` · ${p.situacao}` : ''}`);
    } else if (bundle.pis && !bundle.pis.ok) {
      lines.push(`<span style="color:#b45309;">PIS: ${bundle.pis.error || 'indisponível'}</span>`);
    }
    if (bundle.basico?.ok && bundle.basico.client?.name) {
      lines.push(`<strong>Cadastro:</strong> ${bundle.basico.client.name}`);
    }
    return lines.join('<br/>');
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

  /** Certidão negativa civil (PF) — FonteData ccd-pf. Docs: https://fontedata.com/docs */
  async lookupCertidaoCivil(cpfDigits) {
    const cpf = String(cpfDigits || '').replace(/\D/g, '');
    if (cpf.length !== 11) {
      return { ok: false, error: 'CPF inválido (11 dígitos).' };
    }
    return this.lookupCpfConsulta(cpf, 'ccd-pf');
  },

  /** Certidão TJ — Cível, Criminal e Fiscal (FonteData tj-certidao). */
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
        cpf: doc.length === 11 ? doc : '',
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

    /** Nova Vida NVCHECK — padrão para CPF (substitui FonteData). */
    if (this._cpfViaNovaTI()) {
      this._loading = true;
      this._lastCpf = cpf;
      try {
        const res = await NovaTI.lookupCpf(cpf);
        if (!res.ok) return res;
        const c = res.client || {};
        const mapped = {
          cpf: String(c.cpf || cpf).replace(/\D/g, ''),
          name: String(c.name || '').trim(),
          phone1: String(c.phone1 || '').replace(/\D/g, ''),
          phone2: String(c.phone2 || '').replace(/\D/g, ''),
          email: String(c.email || '').trim(),
          motherName: String(c.motherName || '').trim(),
          fatherName: String(c.fatherName || '').trim(),
          address: String(c.address || '').trim(),
          civilState: String(c.civilState || '').trim(),
          birthDate: String(c.birthDate || '').trim(),
          situacao_cadastral: String(c.situacao_cadastral || '').trim(),
        };
        if (!mapped.name) {
          return { ok: false, error: 'Nenhum dado encontrado para este CPF.' };
        }
        return { ok: true, client: mapped, raw: res.raw, provider: 'novati' };
      } catch (e) {
        return { ok: false, error: e.message || 'Falha na consulta Nova Vida' };
      } finally {
        this._loading = false;
      }
    }

    const url = this.apiUrl();
    const token = this.token();
    if (!url || !token) {
      return { ok: false, error: 'Consulta CPF não configurada (carregue novati.js ou fontedata.php).' };
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
      return { ok: true, client: mapped, raw: json.data, provider: 'fontedata' };
    } catch (e) {
      return { ok: false, error: e.message || 'Falha na consulta' };
    } finally {
      this._loading = false;
    }
  },
};

window.FonteData = FonteData;
