/* CPF: não usar Number — Excel/JSON cortam zeros (ex.: ...00 no final). */
(function () {
  function grab(name) {
    try {
      if (name === 'LeadsImport' && typeof LeadsImport !== 'undefined') return LeadsImport;
      if (name === 'LeadsDB' && typeof LeadsDB !== 'undefined') return LeadsDB;
    } catch (_) { /* script sem esse const */ }
    try {
      if (window[name]) return window[name];
    } catch (_) { /* noop */ }
    return null;
  }

  /**
   * cellToText — célula SheetJS em texto; prefere máscara (cell.w) e inteiro exato.
   */
  function cellToText(cell) {
    if (!cell) return '';
    const formatted = cell.w != null ? String(cell.w).trim() : '';
    const formattedOk = formatted !== '' && !/e[+-]?\d+/i.test(formatted);
    if (cell.t === 'n' && typeof cell.v === 'number' && Number.isFinite(cell.v)) {
      const isInt = Number.isInteger(cell.v) || Math.abs(cell.v - Math.round(cell.v)) < 1e-9;
      if (isInt) {
        const intStr = String(Math.round(Math.abs(cell.v)));
        if (formattedOk) {
          const fd = formatted.replace(/[^\d]/g, '');
          if (fd.length >= intStr.length) return formatted;
        }
        return intStr;
      }
    }
    if (formattedOk) return formatted;
    if (cell.v == null || cell.v === '') return '';
    if (typeof cell.v === 'number' && Number.isFinite(cell.v)) {
      if (Number.isInteger(cell.v) || Math.abs(cell.v - Math.round(cell.v)) < 1e-9) {
        return String(Math.round(Math.abs(cell.v)));
      }
      return String(cell.v);
    }
    return String(cell.v);
  }

  /**
   * sheetToPlainObjects — todas as células como string (CPF nunca vira JSON number).
   */
  function sheetToPlainObjects(sheet) {
    if (!sheet || !sheet['!ref'] || typeof XLSX === 'undefined') return [];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const headers = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      const h = cellToText(sheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })]).trim();
      headers.push(h || ('COL_' + (C + 1)));
    }
    const rows = [];
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      const obj = {};
      let empty = true;
      for (let C = range.s.c; C <= range.e.c; C++) {
        const v = cellToText(sheet[XLSX.utils.encode_cell({ r: R, c: C })]);
        obj[headers[C - range.s.c]] = v;
        if (v !== '') empty = false;
      }
      if (!empty) rows.push(obj);
    }
    return rows;
  }

  /**
   * normalizeCpf — só dígitos, 11 posições, sem parseInt na string inteira.
   */
  function normalizeCpf(cpf) {
    if (cpf == null || cpf === '') return '';
    let digits = '';
    if (typeof cpf === 'number' && Number.isFinite(cpf)) {
      digits = (Number.isInteger(cpf) || Math.abs(cpf - Math.round(cpf)) < 1e-9)
        ? String(Math.round(Math.abs(cpf)))
        : String(cpf).replace(/[^\d]/g, '');
    } else {
      const s = String(cpf).trim();
      if (/e[+-]?\d+/i.test(s)) {
        const n = Number(s);
        digits = (Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER)
          ? String(Math.round(Math.abs(n)))
          : s.replace(/[^\d]/g, '');
      } else {
        digits = s.replace(/[^\d]/g, '');
      }
    }
    if (digits.length > 11) digits = digits.slice(-11);
    if (digits.length === 10) digits = digits.padStart(11, '0');
    return digits;
  }

  function pickImport() {
    var I = grab('LeadsImport');
    if (I) {
      try { window.LeadsImport = I; } catch (_) { /* noop */ }
    }
    return I;
  }

  function pickDb() {
    var D = grab('LeadsDB');
    if (D) {
      try { window.LeadsDB = D; } catch (_) { /* noop */ }
    }
    return D;
  }

  function installImport() {
    const I = pickImport();
    if (!I || I.__cpfZerosFix) return !!I;
    I.__cpfZerosFix = true;
    I.cellToText = cellToText;
    I.sheetToPlainObjects = sheetToPlainObjects;
    I.normalizeCpf = normalizeCpf;
    I.parseFile = function (file) {
      return new Promise((resolve, reject) => {
        if (typeof XLSX === 'undefined') {
          reject(new Error('Biblioteca XLSX não carregada.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: false, raw: false, cellText: true });
            const sheetName = workbook.SheetNames[0];
            const rawRows = sheetToPlainObjects(workbook.Sheets[sheetName]);
            if (!rawRows.length) throw new Error('Planilha vazia ou sem dados.');
            resolve({ headers: Object.keys(rawRows[0]), rows: rawRows, totalRows: rawRows.length, sheetName });
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = function () { reject(new Error('Erro ao ler o arquivo.')); };
        reader.readAsArrayBuffer(file);
      });
    };
    const origTransform = I.transformRows.bind(I);
    I.transformRows = function (rows, mapping) {
      const leads = origTransform(rows, mapping);
      leads.forEach(function (lead) {
        if (lead.cpf) lead.cpf = normalizeCpf(lead.cpf);
      });
      return leads;
    };
    I.formatCPF = function (cpf) {
      const cleaned = normalizeCpf(cpf);
      if (cleaned.length !== 11) return cpf == null || cpf === '' ? '' : String(cpf);
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    };
    if (typeof I.isValidCPF === 'function') {
      I.isValidCPF = function (cpf) {
        return normalizeCpf(cpf).length >= 10;
      };
    }
    I.validateLeads = function (leads) {
      const valid = [];
      const invalid = [];
      (leads || []).forEach(function (lead, idx) {
        if (lead && lead.cpf) lead.cpf = normalizeCpf(lead.cpf);
        if (!lead || !lead.name || String(lead.name).trim().length < 2) {
          invalid.push({ row: idx + 2, lead: lead, errors: ['Nome ausente ou muito curto'] });
        } else {
          valid.push(lead);
        }
      });
      return { valid: valid, invalid: invalid };
    };
    return true;
  }

  function installValidate() {
    const I = pickImport();
    if (!I || I.__cpfNoBlock) return !!I;
    I.__cpfNoBlock = true;
    I.normalizeCpf = normalizeCpf;
    I.validateLeads = function (leads) {
      const valid = [];
      const invalid = [];
      (leads || []).forEach(function (lead, idx) {
        if (lead && lead.cpf) lead.cpf = normalizeCpf(lead.cpf);
        if (!lead || !lead.name || String(lead.name).trim().length < 2) {
          invalid.push({ row: idx + 2, lead: lead, errors: ['Nome ausente ou muito curto'] });
        } else {
          valid.push(lead);
        }
      });
      return { valid: valid, invalid: invalid };
    };
    I.isValidCPF = function (cpf) {
      return normalizeCpf(cpf).length >= 10;
    };
    I.formatCPF = function (cpf) {
      const cleaned = normalizeCpf(cpf);
      if (cleaned.length !== 11) return cpf == null || cpf === '' ? '' : String(cpf);
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    };
    return true;
  }

  /**
   * splitLeadChunks — parte o POST para ficar abaixo do WAF (~16KB).
   * Lote maior chega com corpo vazio e o MySQL devolve 1136.
   */
  function splitLeadChunks(rows) {
    const MAX = 12000;
    const chunks = [];
    let cur = [];
    let size = 2;
    rows.forEach(function (row) {
      const n = JSON.stringify(row).length + 1;
      if (cur.length && size + n > MAX) {
        chunks.push(cur);
        cur = [];
        size = 2;
      }
      cur.push(row);
      size += n;
    });
    if (cur.length) chunks.push(cur);
    return chunks;
  }

  /**
   * installExtraJson — POST /leads manda extra_data como string e em pedaços <=12KB.
   * Sem isso o PDO recebe array (1136) ou o WAF zera o corpo (1136 de novo).
   */
  function installExtraJson() {
    if (typeof supaReq !== 'function' || window.__leadsChunk12) return;
    window.__leadsChunk12 = true;
    window.__leadsExtraJsonFix = true;
    const origSupa = supaReq;
    window.supaReq = async function (method, table, body, params) {
      if (String(method).toUpperCase() === 'POST' && table === 'leads' && Array.isArray(body)) {
        body = body.map(function (row) {
          const r = Object.assign({}, row);
          if (r.extra_data && typeof r.extra_data === 'object') {
            try { r.extra_data = JSON.stringify(r.extra_data); } catch (e) { r.extra_data = '{}'; }
          }
          return r;
        });
        const chunks = splitLeadChunks(body);
        if (chunks.length > 1) {
          let out = [];
          for (let i = 0; i < chunks.length; i++) {
            const part = await origSupa(method, table, chunks[i], params);
            if (Array.isArray(part)) out = out.concat(part);
          }
          return out;
        }
        body = chunks[0];
      }
      return origSupa(method, table, body, params);
    };
    try { supaReq = window.supaReq; } catch (_) { /* const no outro script */ }
  }

  function installDb() {
    installExtraJson();
    const D = pickDb();
    const I = pickImport();
    if (!D || !D.importLeads || D.__cpfZerosFix) return !!D;
    D.__cpfZerosFix = true;
    const orig = D.importLeads.bind(D);
    D.importLeads = function (batchId, leadsArray) {
      const n = (leadsArray || []).map(function (l) {
        const cpf = I && I.normalizeCpf ? I.normalizeCpf(l.cpf) : normalizeCpf(l.cpf);
        return Object.assign({}, l, { cpf: cpf });
      });
      return orig(batchId, n);
    };
    return true;
  }

  function installMask() {
    if (typeof window._maskCPF !== 'function' || window.__cpfMaskFix) {
      return typeof window._maskCPF === 'function';
    }
    window.__cpfMaskFix = true;
    window._maskCPF = function (cpf) {
      const c = normalizeCpf(cpf);
      if (c.length !== 11) return cpf == null || cpf === '' ? '' : String(cpf);
      return c.slice(0, 3) + '.***.*' + c.slice(8, 9) + '*-' + c.slice(9);
    };
    return true;
  }

  function boot() {
    installImport();
    installValidate();
    installDb();
    installMask();
  }
  boot();
  document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('load', boot);
})();
