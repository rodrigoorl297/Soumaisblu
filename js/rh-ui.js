/* SOU+BLU — utilitários UI do RH (Bootstrap: d-none, classes utilitárias) */
(function (global) {
  'use strict';

  function node(idOrEl) {
    if (!idOrEl) return null;
    return typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
  }

  function show(idOrEl) {
    const el = node(idOrEl);
    if (!el) return;
    el.classList.remove('d-none');
    el.removeAttribute('hidden');
    if (el.style && el.style.display === 'none') el.style.removeProperty('display');
  }

  function hide(idOrEl) {
    const el = node(idOrEl);
    if (!el) return;
    el.classList.add('d-none');
  }

  function toggle(idOrEl, visible) {
    if (visible) show(idOrEl);
    else hide(idOrEl);
  }

  function on(idOrEl, event, handler) {
    const el = node(idOrEl);
    if (el) el.addEventListener(event, handler);
  }

  function wireClick(selector, handler, root) {
    (root || document).querySelectorAll(selector).forEach((el) => {
      el.addEventListener('click', handler);
    });
  }

  global.RhUi = { show, hide, toggle, on, wireClick, node };
})(window);
