/** Alias — use js/db-connect.js */
(function () {
  var s = document.createElement('script');
  s.src = (document.currentScript && document.currentScript.src)
    ? document.currentScript.src.replace(/hostinger-connect\.js(\?.*)?$/i, 'db-connect.js$1')
    : 'db-connect.js';
  s.async = false;
  document.head.appendChild(s);
})();
