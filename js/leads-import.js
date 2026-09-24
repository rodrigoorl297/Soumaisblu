/* =============================================
   Gerenciador de Leads – Importação de Planilhas
   Parse XLSX/CSV client-side
   ============================================= */

const LeadsImport = {

  KNOWN_FIELDS: {
    name:        { label: 'Nome',         aliases: ['nome', 'nome completo', 'nome_completo', 'name', 'cliente', 'beneficiário', 'beneficiario'] },
    orgao:       { label: 'Órgão',        aliases: ['órgão', 'orgao', 'orgão/empresa', 'empresa', 'org', 'lotação', 'lotacao', 'instituição', 'instituicao'] },
    cpf:         { label: 'CPF',          aliases: ['cpf', 'cpf/cnpj', 'documento', 'doc', 'cpf_cnpj'] },
    score:       { label: 'Score',        aliases: ['score', 'pontuação', 'pontuacao', 'score_lead', 'score lead', 'classificação', 'classificacao', 'rank', 'score_credito'] },
    mother_name: { label: 'Nome da Mãe',  aliases: ['nome da mãe', 'nome_da_mae', 'mae', 'mãe', 'mother', 'filiação', 'filiacao', 'nome mae'] },
    // Inclui "CEL 1" / "CEL1" — planilhas de compra usam esse cabeçalho e o includes('celular') não pega.
    phone:       { label: 'Telefone 1',   aliases: ['telefone 1', 'telefone1', 'tel 1', 'tel1', 'celular 1', 'celular1', 'cel 1', 'cel1', 'fone 1', 'fone1', 'telefone', 'tel', 'celular', 'cel', 'fone', 'phone', 'whatsapp', 'contato', 'número', 'numero'] },
    phone2:      { label: 'Telefone 2',   aliases: ['telefone 2', 'telefone2', 'tel 2', 'tel2', 'celular 2', 'celular2', 'cel 2', 'cel2', 'fone 2', 'fone2', 'whatsapp 2', 'contato 2', 'número 2', 'phone2'] },
  },

  /**
   * Parse an uploaded file (xlsx, xls, or csv)
   * Returns: { headers: string[], rows: object[], totalRows: number }
   */
  async parseFile(file) {
    if (typeof XLSX === 'undefined') {
      if (typeof window.ensureXlsx === 'function') await window.ensureXlsx();
      else {
        const sources = [
          '../js/vendor/xlsx.full.min.js?v=xlsx203',
          'js/vendor/xlsx.full.min.js?v=xlsx203',
          'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
          'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
        ];
        let lastErr = null;
        for (const src of sources) {
          try {
            await new Promise((resolve, reject) => {
              const s = document.createElement('script');
              s.src = src;
              s.onload = () => resolve();
              s.onerror = () => reject(new Error('SheetJS load failed: ' + src));
              document.head.appendChild(s);
            });
            if (typeof XLSX !== 'undefined') break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (typeof XLSX === 'undefined') {
          throw lastErr || new Error('SheetJS');
        }
      }
    }
return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          if (typeof XLSX === 'undefined') {
            throw new Error('Biblioteca XLSX não carregada. Inclua o script SheetJS.');
          }

          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array', cellDates: false, raw: false, cellText: true });

          // Use first sheet
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];

          // Convert to JSON with headers
          const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

          if (!rawRows.length) {
            throw new Error('Planilha vazia ou sem dados.');
          }

          const headers = Object.keys(rawRows[0]);

          resolve({
            headers,
            rows: rawRows,
            totalRows: rawRows.length,
            sheetName,
          });
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'));
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * Auto-detect column mapping
   * Returns: { name: 'colA', cpf: 'colB', ... }
   */
  autoMapColumns(headers) {
    const mapping = {};

    for (const [fieldKey, fieldDef] of Object.entries(this.KNOWN_FIELDS)) {
      for (const header of headers) {
        const normalized = header.toLowerCase().trim()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // Alias curto (≤3) só com igualdade — evita "cel" bater em "excelencia".
        const match = fieldDef.aliases.some(alias => {
          const normalizedAlias = alias.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (normalized === normalizedAlias) return true;
          if (normalizedAlias.length <= 3) return false;
          return normalized.includes(normalizedAlias);
        });
        if (match && !mapping[fieldKey]) {
          mapping[fieldKey] = header;
          break;
        }
      }
    }

    return mapping;
  },

  /**
   * pickPhoneFromExtra — resgata celular de colunas não mapeadas (ex.: "CEL 1").
   * Usado no transform e como rede de segurança se o autoMap falhar.
   */
  pickPhoneFromExtra(extra, which = 1) {
    if (!extra || typeof extra !== 'object') return '';
    const want = which === 2 ? 2 : 1;
    const normKey = (k) => String(k || '').toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[_\-\s]+/g, '');
    const rank = (k) => {
      const n = normKey(k);
      if (want === 1 && /^(cel|celular|tel|telefone|fone|whatsapp|phone|contato)1?$/.test(n)) return 1;
      if (want === 2 && /^(cel|celular|tel|telefone|fone|whatsapp|phone|contato)2$/.test(n)) return 1;
      return 0;
    };
    let best = '';
    for (const [k, v] of Object.entries(extra)) {
      if (!rank(k)) continue;
      const digits = String(v || '').replace(/\D/g, '');
      if (digits.length >= 8) { best = String(v).trim(); break; }
    }
    return best;
  },

  /**
   * Apply column mapping and transform raw rows into lead objects
   */
  transformRows(rows, columnMapping) {
    return rows.map(row => {
      const lead = { extra_data: {} };

      // Map known fields
      for (const [fieldKey, sourceCol] of Object.entries(columnMapping)) {
        if (sourceCol && row[sourceCol] !== undefined) {
          lead[fieldKey] = String(row[sourceCol] || '').trim();
        }
      }

      // Put unmapped columns in extra_data
      const mappedCols = new Set(Object.values(columnMapping));
      for (const [col, val] of Object.entries(row)) {
        if (!mappedCols.has(col) && val !== '' && val !== null && val !== undefined) {
          lead.extra_data[col] = String(val).trim();
        }
      }

      // Clean CPF
      if (lead.cpf) {
        lead.cpf = lead.cpf.replace(/[^\d]/g, '');
      }

      // Clean phone + resgate de "CEL 1" etc. no extra_data
      if (!lead.phone) {
        const fromExtra = this.pickPhoneFromExtra(lead.extra_data, 1);
        if (fromExtra) lead.phone = fromExtra;
      }
      if (!lead.phone2) {
        const fromExtra2 = this.pickPhoneFromExtra(lead.extra_data, 2);
        if (fromExtra2) lead.phone2 = fromExtra2;
      }
      if (lead.phone) {
        lead.phone = lead.phone.replace(/[^\d+() -]/g, '');
      }
      if (lead.phone2) {
        lead.phone2 = lead.phone2.replace(/[^\d+() -]/g, '');
      }

      return lead;
    });
  },

  /**
   * Validate transformed leads
   * Returns: { valid: Lead[], invalid: { row: number, errors: string[] }[] }
   */
  validateLeads(leads) {
    const valid = [];
    const invalid = [];

    leads.forEach((lead, idx) => {
      const errors = [];

      // Name is required
      if (!lead.name || lead.name.length < 2) {
        errors.push('Nome ausente ou muito curto');
      }

      // CPF validation (if present)
      /* CPF: não barrar lote por dígito verificador — zeros da planilha. */

      if (errors.length) {
        invalid.push({ row: idx + 2, lead, errors }); // +2 = header + 0-index
      } else {
        valid.push(lead);
      }
    });

    return { valid, invalid };
  },

  /**
   * Validate CPF
   */
  isValidCPF(cpf) {
    const cleaned = cpf.replace(/\D/g, '');
    if (cleaned.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cleaned)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(cleaned[i]) * (10 - i);
    let d1 = 11 - (sum % 11);
    if (d1 >= 10) d1 = 0;
    if (parseInt(cleaned[9]) !== d1) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(cleaned[i]) * (11 - i);
    let d2 = 11 - (sum % 11);
    if (d2 >= 10) d2 = 0;
    if (parseInt(cleaned[10]) !== d2) return false;

    return true;
  },

  /**
   * Format CPF for display
   */
  formatCPF(cpf) {
    const cleaned = (cpf || '').replace(/\D/g, '');
    if (cleaned.length !== 11) return cpf;
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  },

  /**
   * Detect duplicates within the lead set
   */
  findDuplicates(leads) {
    const cpfMap = new Map();
    const duplicates = [];

    leads.forEach((lead, idx) => {
      if (lead.cpf && lead.cpf.length === 11) {
        if (cpfMap.has(lead.cpf)) {
          duplicates.push({ row: idx + 2, cpf: lead.cpf, firstRow: cpfMap.get(lead.cpf) });
        } else {
          cpfMap.set(lead.cpf, idx + 2);
        }
      }
    });

    return duplicates;
  },
};

try { window.LeadsImport = LeadsImport; } catch (_) {}
