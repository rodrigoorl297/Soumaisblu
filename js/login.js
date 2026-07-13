/* ==========================================================
   SOU + BLU – Login v3 [OTIMIZADO E SEM EMOJIS]
   ========================================================== */

(function ensureLoginBootUi() {
  if (typeof window.showLoading === 'function') return;
  window.showLoading = function (msg) {
    let el = document.getElementById('globalLoader');
    if (!el) {
      el = document.createElement('div');
      el.id = 'globalLoader';
      el.style.cssText =
        'position:fixed;inset:0;background:rgba(255,255,255,.9);z-index:10500;display:flex;align-items:center;justify-content:center;';
      el.innerHTML =
        '<p style="font-family:system-ui,sans-serif;font-weight:700;color:#0a2d8f;margin:0;">' +
        (msg || 'Carregando...') +
        '</p>';
      document.body.appendChild(el);
    } else {
      const p = el.querySelector('p');
      if (p) p.textContent = msg || 'Carregando...';
    }
  };
  window.hideLoading = function () {
    document.getElementById('globalLoader')?.remove();
  };
})();

const _DB_LOAD_ERROR = 'Erro na comunicação de dados. Verifique sua conexão ou limpe o cache (Ctrl+F5).';

function _dbgLogin(location, message, data, hypothesisId) {
  const payload = {
    sessionId: '97c411',
    location,
    message,
    data: data || {},
    timestamp: Date.now(),
    hypothesisId: hypothesisId || 'login-boot',
    runId: '97c411login',
  };
}

// 1. Otimização do Waiter do Banco de Dados
async function _requireDB(maxAttempts = 50) {
  if (window.DB?.init) return window.DB;
  return new Promise(resolve => {
    let attempts = 0;
    const interval = setInterval(() => {
      if (window.DB?.init) { 
        clearInterval(interval); 
        resolve(window.DB); 
      } else if (++attempts > maxAttempts) { 
        clearInterval(interval); 
        resolve(null); 
      }
    }, 100);
  });
}

// 2. Inicialização do Login
document.addEventListener('DOMContentLoaded', async () => {
  _dbgLogin('login.js:DOMContentLoaded', 'login boot start', { href: location.pathname }, 'login-entry');
  showLoading('Conectando...');
  try {
    const db = await _requireDB();
    if (!db) throw new Error('DB timeout');
    _dbgLogin('login.js:db-ready', 'db available', { online: !!db.online }, 'login-db');
    await db.init();

    // Redireciona se já logado — sincroniza papel com o banco antes (evita sessão antiga no PC)
    if (await Auth.isLoggedIn()) {
      _dbgLogin('login.js:already-logged-in', 'redirect existing session', { role: Auth.getSession()?.role }, 'login-redirect');
      await Auth.syncSessionFromDb();
      window.location.replace(Auth.defaultAppHref());
      return;
    }
    
    setupLoginForm();
    _dbgLogin('login.js:form-ready', 'login form ready', {}, 'login-entry');
  } catch (e) {
    console.error('[Login Boot Error]', e);
    _dbgLogin('login.js:boot-error', 'login boot failed', { err: String(e?.message || e) }, 'login-db');
    showLoginError(_DB_LOAD_ERROR);
  } finally {
    hideLoading();
  }
});

// 3. Encapsulamento da Lógica de Formulário
function setupLoginForm() {
  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPassword');
  const btn = document.getElementById('loginBtn');
  const btnText = document.querySelector('.btn-text');
  const btnLoad = document.querySelector('.btn-loader');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = emailInput.value.trim();
    const pw = passInput.value.trim();
    
    if (!id || !pw) return showLoginError('Informe e-mail/matrícula e senha.');

    // Prepara Interface para o estado de Carregamento
    showLoginError(''); // Oculta erros anteriores
    if (btnText) btnText.style.display = 'none';
    if (btnLoad) btnLoad.style.display = 'inline';
    if (btn) btn.disabled = true;

    try {
      const r = await Auth.login(id, pw);
      if (!r.ok) {
        _dbgLogin('login.js:submit-fail', 'auth login rejected', { msg: r.msg }, 'login-auth');
        showLoginError(r.msg);
        passInput.value = ''; // Limpa a senha para nova tentativa
        passInput.focus();
      } else {
        _dbgLogin('login.js:submit-ok', 'auth login ok', { role: r.user?.role, target: Auth.defaultAppHref() }, 'login-auth');
        window.location.replace(Auth.defaultAppHref());
        return; 
      }
    } catch (err) {
      console.error('[Login Submit Error]', err);
      _dbgLogin('login.js:submit-error', 'auth login exception', { err: String(err?.message || err) }, 'login-auth');
      showLoginError('Erro de conexão. Verifique sua internet.');
    } finally {
      // Restaura o botão caso o login tenha falhado
      if (btnText) btnText.style.display = 'inline';
      if (btnLoad) btnLoad.style.display = 'none';
      if (btn) btn.disabled = false;
    }
  });
}

// 4. Funções Auxiliares de Interface
function showLoginError(msg) {
  const errorDiv = document.getElementById('loginError');
  if (!errorDiv) return;
  
  if (msg) {
    errorDiv.textContent = msg;
    errorDiv.style.display = 'flex';
  } else {
    errorDiv.style.display = 'none';
  }
}

function togglePassword(id, btn) {
  const input = document.getElementById(id);
  if (!input) return;
  
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  
  // Alterna o texto baseando-se no estado
  if (btn) btn.textContent = isPassword ? 'Mostrar' : 'Ocultar'; 
}