/* Redirecionamento imediato perfil portaria — evita loop admin/employee com auth.js em cache */
(function (global) {
  if (!global || !global.location) return;
  var SK = 'soublu_session';
  var LK = 'soublu_prt_loop';
  function sessionRole() {
    try {
      var raw = global.sessionStorage.getItem(SK) || global.localStorage.getItem(SK);
      if (!raw) return '';
      return String(JSON.parse(raw).role || '').toLowerCase();
    } catch (e) { return ''; }
  }
  function inPages() {
    return /(^|\/)pages(\/|$)/i.test(String(global.location.pathname || '').replace(/\\/g, '/'));
  }
  function adminHref() {
    var rel = inPages() ? 'admin.html' : 'pages/admin.html';
    try { return new URL(rel, global.location.href).href; } catch (e) { return rel; }
  }
  var role = sessionRole();
  if (role !== 'portaria') return;
  var path = String(global.location.pathname || '');
  if (/employee\.html/i.test(path)) {
    var n = parseInt(global.sessionStorage.getItem(LK) || '0', 10) + 1;
    if (n > 12) return;
    global.sessionStorage.setItem(LK, String(n));
    global.location.replace(adminHref());
    return;
  }
  if (/admin\.html/i.test(path)) {
    global.sessionStorage.removeItem(LK);
    global.SOUBLU_PORTARIA_BOOT = true;
  }
})(typeof window !== 'undefined' ? window : {});
