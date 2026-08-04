/* SOU+BLU — Boot: Justificativa de Falta (HTML separado + eventos em JS) */
(function () {
  'use strict';

  function sectionsUrl() {
    const rel = (typeof Auth !== 'undefined' && Auth._isInPagesDir && Auth._isInPagesDir())
      ? 'rh-justificativa-section.html?v=justif-bs1'
      : 'pages/rh-justificativa-section.html?v=justif-bs1';
    return typeof Auth !== 'undefined' && Auth.resolveHref
      ? Auth.resolveHref(rel)
      : rel;
  }

  function ui() {
    return window.RhUi || {
      show: (id) => { const el = document.getElementById(id); if (el) el.style.display = ''; },
      hide: (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; },
      toggle: (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; },
      on: (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn),
    };
  }

  async function loadJustificativaSection() {
    if (document.getElementById('tab-justificativa')?.dataset.rhLoaded === '1') return;
    const host = document.getElementById('rhJustificativaHost');
    if (!host) return;
    const res = await fetch(sectionsUrl());
    if (!res.ok) throw new Error('Não foi possível carregar Justificativa de Falta.');
    const wrap = document.createElement('div');
    wrap.innerHTML = await res.text();
    const tab = wrap.querySelector('#tab-justificativa');
    const modal = wrap.querySelector('#justificativaModal');
    if (tab) {
      tab.dataset.rhLoaded = '1';
      host.replaceWith(tab);
    }
    if (modal && !document.getElementById('justificativaModal')) {
      document.body.appendChild(modal);
    }
    wireJustificativaEvents();
  }

  function wireJustificativaEvents() {
    const U = ui();
    const form = document.getElementById('form-justificativa');
    if (form && !form.dataset.rhWired) {
      form.dataset.rhWired = '1';
      form.addEventListener('submit', (e) => {
        if (typeof salvarJustificativa === 'function') salvarJustificativa(e);
      });
    }

    document.querySelectorAll('[data-rh-action]').forEach((btn) => {
      if (btn.dataset.rhBound) return;
      btn.dataset.rhBound = '1';
      btn.addEventListener('click', (e) => {
        const action = btn.getAttribute('data-rh-action');
        if (action === 'justif-open-new' && typeof openJustificativaModal === 'function') {
          openJustificativaModal();
        } else if (action === 'justif-close' && typeof closeModalRH === 'function') {
          closeModalRH('justificativaModal');
        } else if (action === 'justif-buscar-dados' && typeof buscarDadosJustificativa === 'function') {
          buscarDadosJustificativa();
        } else if (action === 'justif-atestado-pick') {
          document.getElementById('justif_atestado_file')?.click();
        }
      });
    });

    U.on('justif_employee', 'change', () => {
      if (typeof onJustifEmployeeChange === 'function') onJustifEmployeeChange();
    });
    U.on('justif_tipo', 'change', () => {
      if (typeof onJustifTipoChange === 'function') onJustifTipoChange();
    });
    ['justif_data_afastamento', 'justif_data_retorno'].forEach((id) => {
      U.on(id, 'change', () => {
        if (typeof onJustifDatasChange === 'function') onJustifDatasChange();
      });
    });
    U.on('justif_atestado_file', 'change', function () {
      if (typeof onJustifAtestadoPick === 'function') onJustifAtestadoPick(this);
    });
  }

  window.loadRhJustificativaSection = loadJustificativaSection;

  document.addEventListener('DOMContentLoaded', () => {
    loadJustificativaSection().catch((e) => console.warn('[RH] justificativa section:', e));
  });
})();
