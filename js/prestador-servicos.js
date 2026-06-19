/* SOU+BLU — Cadastro Prestador de Serviços (terceirizados) — Financeiro */
(function () {
  const SITUACAO = {
    ativo: { label: 'Ativo', cls: 'badge-success' },
    ativo_restrito: { label: 'Ativo restrito', cls: 'badge-warning' },
    inativo: { label: 'Inativo', cls: 'badge-muted' },
  };

  let _anexoPending = { contrato: null, compliance: null, rg_cpf: null };
  let _anexoUrls = { contrato: '', compliance: '', rg_cpf: '' };

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function fmtMoney(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
    } catch {
      return iso;
    }
  }

  function canManage() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!s || window.PARTNER_ROOT_ID) return false;
    return ['master', 'fundador', 'gerente', 'financeiro', 'financial'].includes(String(s.role || '').toLowerCase());
  }

  function _author() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    return s?.name || 'Financeiro';
  }

  function gerarProtocoloPrestador() {
    const el = document.getElementById('prestador_protocolo');
    if (!el) return '';
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    el.value = `PS-${d}-${Math.floor(1000 + Math.random() * 9000)}`;
    return el.value;
  }

  function _resetAnexos(urls = {}) {
    _anexoPending = { contrato: null, compliance: null, rg_cpf: null };
    _anexoUrls = {
      contrato: urls.contrato || '',
      compliance: urls.compliance || '',
      rg_cpf: urls.rg_cpf || '',
    };
    ['contrato', 'compliance', 'rg_cpf'].forEach((k) => {
      const input = document.getElementById(`prestador_anexo_${k}`);
      if (input) input.value = '';
      _setAnexoStatus(k, _anexoUrls[k] ? 'Arquivo anexado' : 'Nenhum arquivo');
    });
  }

  function _setAnexoStatus(kind, label) {
    const el = document.getElementById(`prestador_anexo_${kind}_status`);
    if (el) el.textContent = label || 'Nenhum arquivo';
  }

  function onPrestadorAnexoPick(kind, input) {
    const file = input?.files?.[0];
    if (!file) return;
    _anexoPending[kind] = file;
    _setAnexoStatus(kind, file.name);
  }

  async function buscarApiPrestador() {
    const raw = document.getElementById('prestador_document')?.value || '';
    const digits = raw.replace(/\D/g, '');
    const info = document.getElementById('prestador_api_info');
    const nameEl = document.getElementById('prestador_nome');

    if (digits.length !== 11 && digits.length !== 14) {
      alert('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).');
      return;
    }

    if (typeof FonteData === 'undefined') {
      alert('API de consulta não carregada.');
      return;
    }

    const btn = document.getElementById('btn_prestador_buscar_api');
    if (btn) { btn.disabled = true; btn.textContent = 'Buscando...'; }

    try {
      let nome = '';
      let extra = '';
      if (digits.length === 11) {
        const res = await FonteData.lookupCpf(digits);
        if (!res.ok) throw new Error(res.error || 'CPF não encontrado');
        nome = res.client?.name || '';
        extra = res.client?.email ? `E-mail: ${res.client.email}` : '';
        document.getElementById('prestador_pix_type').value = 'cpf';
        if (!document.getElementById('prestador_pix').value) {
          document.getElementById('prestador_pix').value = digits;
        }
      } else {
        const res = await FonteData.lookupCnpj(digits);
        if (!res.ok) throw new Error(res.error || 'CNPJ não encontrado');
        const p = res.partner || {};
        nome = p.razao_social || p.nome_fantasia || '';
        extra = p.situacao ? `Situação RF: ${p.situacao}` : '';
        document.getElementById('prestador_pix_type').value = 'cnpj';
      }
      if (nameEl) nameEl.value = nome;
      if (info) {
        info.hidden = false;
        info.innerHTML = `<strong>${esc(nome || '—')}</strong>${extra ? `<br/>${esc(extra)}` : ''}`;
      }
      if (typeof showToast === 'function') showToast('Dados carregados da API.', 'success');
    } catch (e) {
      if (info) {
        info.hidden = false;
        info.innerHTML = `<span style="color:#dc2626;">${esc(e.message || 'Falha na consulta')}</span>`;
      } else {
        alert(e.message || 'Falha na consulta');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'BUSCAR API'; }
    }
  }

  async function _uploadPrestadorAnexos(protocolo) {
    const out = { ..._anexoUrls };
    const sub = String(protocolo || 'ps').replace(/[^a-zA-Z0-9_-]/g, '_');
    for (const kind of ['contrato', 'compliance', 'rg_cpf']) {
      const file = _anexoPending[kind];
      if (!file) continue;
      if (typeof uploadImage === 'function') {
        try {
          const url = await uploadImage(file, 'rh-demissao', `prestadores/${sub}/${kind}`);
          out[kind] = typeof resolvePhotoUrl === 'function' ? (resolvePhotoUrl(url) || url) : url;
        } catch (e) {
          console.warn('[prestador] upload', kind, e?.message || e);
        }
      }
      if (!out[kind] && typeof fileToBase64 === 'function') {
        try { out[kind] = await fileToBase64(file); } catch (_) { /* noop */ }
      }
    }
    return out;
  }

  async function _maybeCreditRecorrencia(row, isNew) {
    if (!isNew || !row.recorrencia_mensal || !row.valor_pago) return;
    const cpf = String(row.document || '').replace(/\D/g, '');
    if (cpf.length !== 11 || typeof DB.addBalance !== 'function') return;
    const users = await DB.getAllUsers();
    const u = users.find(x => String(x.cpf || '').replace(/\D/g, '') === cpf);
    if (!u?.id) return;
    const sess = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    await DB.addBalance(
      u.id,
      row.valor_pago,
      `Prestador de serviços ${row.protocolo} — crédito mensal`,
      sess?.id || 'financeiro'
    );
  }

  const PrestadorServicos = {
    updateSubcategories() {
      const area = document.getElementById('prestador_area').value;
      const cat = document.getElementById('prestador_categoria');
      const ops = {
        'MARKETING': ['INFLUENCIADOR', 'AGÊNCIA DE MKT', 'DIVULGAÇÃO MKT'],
        'JURÍDICO': ['ASSESSORIA JURÍDICA', 'ASSESSORIA JURÍDICA O.S.J'],
        'TI': ['ASSISTÊNCIA TÉCNICA', 'DESENVOLVEDOR', 'ALUGUEL EQUIPAMENTOS'],
        'SERVIÇOS': ['DIARISTA LIMPEZA', 'SERVIÇOS MANUTENÇÃO']
      };
      
      cat.innerHTML = '<option value="">Selecione...</option>';
      if (ops[area]) {
        ops[area].forEach(op => {
          const el = document.createElement('option');
          el.value = op;
          el.textContent = op;
          cat.appendChild(el);
        });
      }
    },

    ensureUi() {
      const host = document.getElementById('finPageContent') || document.querySelector('.page-content');
      if (!host || !canManage()) return;

      if (!document.getElementById('secPrestadorServicos')) {
        const sec = document.createElement('section');
        sec.className = 'section';
        sec.id = 'secPrestadorServicos';
        sec.innerHTML = '<div id="prestadorServicosRoot"></div>';
        host.appendChild(sec);
      }
      this.ensureModals();
    },

    ensureModals() {
      if (document.getElementById('prestadorServicosModal')) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = `
<div class="modal-overlay" id="prestadorServicosModal">
  <div class="modal" style="max-width:780px;">
    <div class="modal-header">
      <h3 id="prestadorModalTitle">Cadastro Prestador de Serviços</h3>
      <button type="button" class="modal-close" onclick="closeModal('prestadorServicosModal')"></button>
    </div>
    <div class="modal-body" style="max-height:78vh;overflow-y:auto;">
      <form id="form-prestador" onsubmit="PrestadorServicos.save(event)">
        <input type="hidden" id="prestador_id"/>
        <div class="form-grid">
          <div class="form-group">
            <label for="prestador_protocolo">Protocolo</label>
            <input type="text" class="form-control text-center" id="prestador_protocolo" style="font-weight:700;background:#f3f4f6;" readonly/>
          </div>
          <div class="form-group">
            <label style="opacity:0;display:block;">Auto</label>
            <span style="font-size:12px;color:var(--color-success);font-weight:700;line-height:38px;">GERAR AUTOMÁTICO</span>
          </div>
        </div>
        <div class="form-grid mt-md">
          <div class="form-group">
            <label for="prestador_document">CPF / CNPJ</label>
            <input type="text" class="form-control" id="prestador_document" placeholder="000.000.000-00 ou CNPJ" required/>
          </div>
          <div class="form-group">
            <label style="opacity:0;display:block;">API</label>
            <button type="button" class="btn btn-accent btn-full" id="btn_prestador_buscar_api" onclick="buscarApiPrestador()">BUSCAR API</button>
          </div>
        </div>
        <div id="prestador_api_info" hidden style="font-size:13px;padding:10px 12px;border-radius:8px;border:1px solid var(--color-border);margin-top:8px;background:#fff;"></div>
        <div class="form-group mt-md">
          <label for="prestador_nome">Nome / Razão social</label>
          <input type="text" class="form-control" id="prestador_nome" required/>
        </div>
        <div class="form-grid mt-md">
          <div class="form-group">
            <label for="prestador_pix_type">Tipo PIX</label>
            <select class="form-control" id="prestador_pix_type">
              <option value="cpf">CPF</option><option value="cnpj">CNPJ</option>
              <option value="email">E-mail</option><option value="telefone">Telefone</option>
              <option value="aleatoria">Aleatória</option>
            </select>
          </div>
          <div class="form-group">
            <label for="prestador_pix">Chave PIX</label>
            <input type="text" class="form-control" id="prestador_pix" required/>
          </div>
        </div>
        <div class="form-grid mt-md">
          <div class="form-group">
            <label for="prestador_area">Área</label>
            <select class="form-control" id="prestador_area" onchange="PrestadorServicos.updateSubcategories()">
              <option value="">Selecione...</option>
              <option value="MARKETING">Marketing</option>
              <option value="JURÍDICO">Jurídico</option>
              <option value="TI">TI</option>
              <option value="SERVIÇOS">Serviços</option>
            </select>
          </div>
          <div class="form-group">
            <label for="prestador_categoria">Serviço / Finalidade</label>
            <select class="form-control" id="prestador_categoria">
              <option value="">Selecione a área primeiro</option>
            </select>
          </div>
        </div>
        <div class="form-group mt-md">
          <label for="prestador_situacao">Situação cadastro</label>
          <select class="form-control" id="prestador_situacao" required>
            <option value="ativo">Ativo</option>
            <option value="ativo_restrito">Ativo restrito</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
        <div class="form-grid three-cols mt-md">
          <div class="form-group">
            <label for="prestador_valor">Valor pago (R$)</label>
            <input type="number" class="form-control" id="prestador_valor" min="0" step="0.01" placeholder="0,00"/>
          </div>
          <div class="form-group">
            <label for="prestador_data_pagamento">Data pagamento</label>
            <input type="date" class="form-control" id="prestador_data_pagamento"/>
          </div>
          <div class="form-group">
            <label for="prestador_vigencia">Vigência</label>
            <input type="text" class="form-control" id="prestador_vigencia" placeholder="Ex: 12 meses"/>
          </div>
        </div>
        <label class="flex items-center" style="gap:8px;font-size:13px;margin-top:12px;cursor:pointer;">
          <input type="checkbox" id="prestador_recorrencia"/>
          Creditar no SOU+BLU mensalmente (quando houver usuário com o mesmo CPF)
        </label>
        <div class="rh-dem-anexos-panel" style="margin-top:14px;padding:14px;border-radius:12px;border:1px solid var(--color-border);background:#f1f5f9;">
          <div style="font-size:12px;font-weight:800;text-transform:uppercase;margin-bottom:10px;color:var(--color-primary);">Documentos</div>
          <div class="rh-dem-anexo-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px;border-radius:10px;border:1px solid var(--color-border);background:#fff;margin-bottom:8px;">
            <span style="flex:1;font-size:13px;font-weight:600;">Termo contrato prestação</span>
            <span id="prestador_anexo_contrato_status" style="font-size:12px;color:var(--color-text-muted);">Nenhum arquivo</span>
            <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('prestador_anexo_contrato')?.click()">Anexar</button>
            <input type="file" id="prestador_anexo_contrato" accept=".pdf,.jpg,.jpeg,.png,.webp" style="position:absolute;width:1px;height:1px;opacity:0;" onchange="onPrestadorAnexoPick('contrato', this)"/>
          </div>
          <div class="rh-dem-anexo-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px;border-radius:10px;border:1px solid var(--color-border);background:#fff;margin-bottom:8px;">
            <span style="flex:1;font-size:13px;font-weight:600;">Termo compliance</span>
            <span id="prestador_anexo_compliance_status" style="font-size:12px;color:var(--color-text-muted);">Nenhum arquivo</span>
            <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('prestador_anexo_compliance')?.click()">Anexar</button>
            <input type="file" id="prestador_anexo_compliance" accept=".pdf,.jpg,.jpeg,.png,.webp" style="position:absolute;width:1px;height:1px;opacity:0;" onchange="onPrestadorAnexoPick('compliance', this)"/>
          </div>
          <div class="rh-dem-anexo-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px;border-radius:10px;border:1px solid var(--color-border);background:#fff;">
            <span style="flex:1;font-size:13px;font-weight:600;">RG / CPF</span>
            <span id="prestador_anexo_rg_cpf_status" style="font-size:12px;color:var(--color-text-muted);">Nenhum arquivo</span>
            <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('prestador_anexo_rg_cpf')?.click()">Anexar</button>
            <input type="file" id="prestador_anexo_rg_cpf" accept=".pdf,.jpg,.jpeg,.png,.webp" style="position:absolute;width:1px;height:1px;opacity:0;" onchange="onPrestadorAnexoPick('rg_cpf', this)"/>
          </div>
        </div>
        <div class="flex gap-md mt-lg">
          <button type="button" class="btn btn-ghost" onclick="closeModal('prestadorServicosModal')">Cancelar</button>
          <button type="submit" class="btn btn-primary btn-lg" style="flex:1;">Salvar</button>
        </div>
      </form>
    </div>
  </div>
</div>`;
      document.body.appendChild(wrap);
    },

    init() {
      this.ensureUi();
    },

    async render() {
      this.ensureUi();
      const root = document.getElementById('prestadorServicosRoot');
      if (!root || !canManage()) return;

      const list = await DB.getFinanceSuppliers();

      root.innerHTML = `
        <div class="section-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
          <div>
            <h2 style="font-weight:800;margin:0 0 4px;">Prestadores de serviços</h2>
            <p class="text-muted" style="margin:0;font-size:14px;">Cadastro de terceirizados — CPF/CNPJ, PIX, pagamentos e documentos.</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" onclick="PrestadorServicos.openModal()">+ Novo prestador</button>
        </div>
        ${this._renderTable(list)}`;

      if (typeof navigateTo === 'function') navigateTo('secPrestadorServicos');
    },

    _renderTable(list) {
      if (!list.length) {
        return '<div class="card card-padded text-muted text-center">Nenhum prestador cadastrado.</div>';
      }
      const rows = list.map(r => {
        const st = SITUACAO[r.situacao] || SITUACAO.ativo;
        const rec = r.recorrencia_mensal ? '<span class="badge badge-info" style="margin-left:4px;">Mensal</span>' : '';
        return `<tr>
          <td><code style="font-size:12px;">${esc(r.protocolo || r.id)}</code></td>
          <td><strong>${esc(r.name)}</strong><div style="font-size:12px;color:var(--color-text-muted);">${esc(r.document || '')}</div></td>
          <td>${esc(r.category || '—')}</td>
          <td>${fmtMoney(r.valor_pago)}</td>
          <td>${fmtDate(r.data_pagamento)}</td>
          <td><span class="badge ${st.cls}">${st.label}</span>${rec}</td>
          <td style="white-space:nowrap;">
            <button type="button" class="btn btn-ghost btn-sm" onclick="PrestadorServicos.openModal('${esc(r.id)}')">Editar</button>
          </td>
        </tr>`;
      }).join('');
      return `<div class="card"><div class="table-responsive"><table class="data-table">
        <thead><tr>
          <th>Protocolo</th><th>Prestador</th><th>Categoria</th><th>Valor</th><th>Pagamento</th><th>Situação</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
    },

    async openModal(id) {
      this.ensureModals();
      const form = document.getElementById('form-prestador');
      if (form) form.reset();
      document.getElementById('prestador_id').value = '';
      document.getElementById('prestadorModalTitle').textContent = 'Cadastro Prestador de Serviços';
      const info = document.getElementById('prestador_api_info');
      if (info) info.hidden = true;
      _resetAnexos();

      if (id) {
        const row = await DB.getFinanceSupplier(id);
        if (!row) {
          if (typeof showToast === 'function') showToast('Registro não encontrado.', 'error');
          return;
        }
        document.getElementById('prestador_id').value = row.id;
        document.getElementById('prestador_protocolo').value = row.protocolo || '';
        document.getElementById('prestador_document').value = row.document || '';
        document.getElementById('prestador_nome').value = row.name || '';
        document.getElementById('prestador_pix_type').value = row.pix_type || 'cpf';
        document.getElementById('prestador_pix').value = row.pix_key || '';
        
        const areaEl = document.getElementById('prestador_area');
        const catEl = document.getElementById('prestador_categoria');
        areaEl.value = '';
        catEl.innerHTML = '<option value="">Selecione a área primeiro</option>';
        if (row.category) {
          const parts = row.category.split(' - ');
          if (parts.length >= 2) {
            areaEl.value = parts[0];
            PrestadorServicos.updateSubcategories();
            catEl.value = parts.slice(1).join(' - ');
          } else {
            catEl.innerHTML = `<option value="${row.category}">${row.category}</option>`;
            catEl.value = row.category;
          }
        }
        
        document.getElementById('prestador_situacao').value = row.situacao || 'ativo';
        document.getElementById('prestador_valor').value = row.valor_pago || '';
        document.getElementById('prestador_data_pagamento').value = (row.data_pagamento || '').slice(0, 10);
        document.getElementById('prestador_vigencia').value = row.vigencia || '';
        document.getElementById('prestador_recorrencia').checked = !!row.recorrencia_mensal;
        _resetAnexos(row.anexos || {});
        document.getElementById('prestadorModalTitle').textContent = 'Editar prestador de serviços';
      } else {
        gerarProtocoloPrestador();
        document.getElementById('prestador_situacao').value = 'ativo';
      }
      openModal('prestadorServicosModal');
    },

    async save(event) {
      event?.preventDefault();
      const id = document.getElementById('prestador_id').value;
      const isNew = !id;
      let protocolo = document.getElementById('prestador_protocolo').value.trim();
      if (!protocolo) protocolo = gerarProtocoloPrestador();

      const documento = document.getElementById('prestador_document').value.trim();
      const name = document.getElementById('prestador_nome').value.trim();
      const pix = document.getElementById('prestador_pix').value.trim();

      if (!documento || !name || !pix) {
        if (typeof showToast === 'function') showToast('Preencha CPF/CNPJ, nome e chave PIX.', 'warning');
        return;
      }

      const btn = document.querySelector('#form-prestador button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

      try {
        const anexos = await _uploadPrestadorAnexos(protocolo);
        const row = {
          id: id || undefined,
          protocolo,
          document: documento,
          name,
          pix_key: pix,
          pix_type: document.getElementById('prestador_pix_type').value,
          category: (document.getElementById('prestador_area').value && document.getElementById('prestador_categoria').value) 
                    ? `${document.getElementById('prestador_area').value} - ${document.getElementById('prestador_categoria').value}` 
                    : (document.getElementById('prestador_categoria').value || 'Terceirizado'),
          valor_pago: (typeof DB !== 'undefined' && DB._moneyAmt) ? DB._moneyAmt(document.getElementById('prestador_valor').value) : (parseFloat(String(document.getElementById('prestador_valor').value).replace(/[^\d.,]/g,'').replace(',','.')) || 0),
          data_pagamento: document.getElementById('prestador_data_pagamento').value || null,
          vigencia: document.getElementById('prestador_vigencia').value.trim(),
          recorrencia_mensal: document.getElementById('prestador_recorrencia').checked,
          situacao: document.getElementById('prestador_situacao').value,
          anexos,
          created_by: _author(),
        };

        const saved = await DB.saveFinanceSupplier(row);
        if (!saved) throw new Error('Não foi possível salvar.');

        await _maybeCreditRecorrencia(saved, isNew);

        closeModal('prestadorServicosModal');
        await this.render();
        if (typeof this.processAutomations === 'function') {
          await this.processAutomations();
        }
        if (typeof showToast === 'function') {
          showToast(isNew ? 'Prestador cadastrado!' : 'Prestador atualizado!', 'success');
        }
      } catch (e) {
        if (typeof showToast === 'function') showToast(e.message || 'Erro ao salvar.', 'error');
        else alert(e.message || 'Erro ao salvar.');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
      }
    },
  };

  PrestadorServicos.processAutomations = async function() {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const list = await DB.getFinanceSuppliers().catch(() => []);
      const hoje = new Date();
      hoje.setHours(0,0,0,0);

      let gerouAlgum = false;

      const allWd = typeof DB.getWithdrawals === 'function' ? await DB.getWithdrawals().catch(() => []) : [];
      
      // Auto-correção de saques gerados com status errado
      for (const w of allWd) {
        if (String(w.employee_id).startsWith('fs-') && String(w.status).toLowerCase() === 'pendente') {
          if (typeof DB._patchWd === 'function') await DB._patchWd(w.id, { status: 'solicitado' }).catch(()=>null);
          w.status = 'solicitado';
        }
      }

      for (const row of list) {
        if (row.situacao !== 'ativo' || !row.data_pagamento || !row.valor_pago) continue;
        
        const dataPag = new Date(row.data_pagamento + 'T00:00:00');
        if (hoje >= dataPag) {
          const supplierWds = allWd.filter(w => {
            if (w.employee_id === row.id) return true;
            try {
              if (typeof w.notes === 'string' && w.notes.startsWith('{')) {
                const meta = JSON.parse(w.notes);
                if (meta.supplier_id === row.id) return true;
              }
            } catch (_) {}
            return false;
          });
          const jaTemHoje = supplierWds.some(w => (w.created_at || w.createdAt || '').startsWith(todayStr));
          if (jaTemHoje) {
            if (row.recorrencia_mensal) {
              dataPag.setMonth(dataPag.getMonth() + 1);
              row.data_pagamento = dataPag.toISOString().slice(0, 10);
            } else {
              row.situacao = 'inativo';
            }
            await DB.saveFinanceSupplier(row).catch(()=>null);
            continue;
          }

          const session = typeof Auth !== 'undefined' && typeof Auth.getSession === 'function' ? Auth.getSession() : null;
          const creatorId = session?.id || 'sys_finance';

          const wdMeta = {
            supplier_id: row.id,
            is_supplier: true
          };

          const wd = {
            id: DB._genId('wd'),
            employee_id: creatorId,
            notes: JSON.stringify(wdMeta),
            amount: (typeof DB !== 'undefined' && DB._moneyAmt) ? DB._moneyAmt(row.valor_pago) : parseFloat(row.valor_pago),
            net_amount: (typeof DB !== 'undefined' && DB._moneyAmt) ? DB._moneyAmt(row.valor_pago) : parseFloat(row.valor_pago),
            irpf_tax: 0,
            status: 'solicitado',
            type: 'pix',
            pix_key_type: String(row.pix_type || 'cpf').toLowerCase(),
            pix_key: String(row.pix_key || '').trim(),
            holder_name: String(row.name || '').trim(),
            bank_name: '',
            admin_note: `Pagamento Prestador: ${row.category || 'Serviço'}`,
            approved_by_master: false,
            approved_by_financial: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          let success = false;
          if (typeof DB._insertWithdrawal === 'function') {
            try {
              if (typeof _cacheDel === 'function') _cacheDel('withdrawals');
              if (typeof window !== 'undefined' && window.sessionStorage) window.sessionStorage.removeItem('supa_cache_withdrawals');
              
              await DB._insertWithdrawal(wd);
              
              if (typeof _cacheDel === 'function') _cacheDel('withdrawals');
              if (typeof window !== 'undefined' && window.sessionStorage) window.sessionStorage.removeItem('supa_cache_withdrawals');
              success = true;
              gerouAlgum = true;
            } catch (e) {
              console.warn('Falha ao gerar saque para fornecedor:', e);
              if (typeof showToast === 'function') showToast('Erro ao gerar saque do prestador ' + (row.name || '') + ': ' + e.message, 'error');
            }
          }

          if (success) {
            if (row.recorrencia_mensal) {
              dataPag.setMonth(dataPag.getMonth() + 1);
              row.data_pagamento = dataPag.toISOString().slice(0, 10);
            } else {
              row.situacao = 'inativo';
            }
            await DB.saveFinanceSupplier(row).catch(()=>null);
          }
        }
      }

      if (gerouAlgum && typeof showToast === 'function') {
        showToast('Saques de prestadores de serviço gerados automaticamente hoje.', 'info');
      }
    } catch (err) {
      console.warn('[PrestadorAutomations]', err);
    }
  };

  window.PrestadorServicos = PrestadorServicos;
  window.buscarApiPrestador = buscarApiPrestador;
  window.onPrestadorAnexoPick = onPrestadorAnexoPick;
})();
