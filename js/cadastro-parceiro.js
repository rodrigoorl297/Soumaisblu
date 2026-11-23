// CONFIG — canais oficiais da landing /cadastro (landingPageBlu).
// whatsapp: só dígitos (país+DDD+número). videoUrl: embed YouTube opcional.
const CONFIG = {
  whatsapp: "551151287754",
  videoUrl: "",
};

const signupForm = document.getElementById('signupForm');
const contactStatus = document.getElementById('contact-status');
const signupSubmit = signupForm.querySelector('button[type="submit"]');
const validPhone = /^[1-9]\d{9,14}$/.test(CONFIG.whatsapp);
const whatsappUrl = message => 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(message);

document.querySelectorAll('.solution-card').forEach(card => {
  const link = card.querySelector('a');
  const product = card.querySelector('h3')?.textContent;
  if (link && product) link.setAttribute('aria-label', 'Conversar sobre ' + product);
});

// Consulta os dados públicos do CNPJ (Receita Federal, via BrasilAPI) para
// enriquecer a mensagem enviada ao WhatsApp. Nada disso é exibido na página
// para o visitante — só chega para nós, junto do cadastro, no WhatsApp.
async function lookupCnpj(cnpjDigits) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + cnpjDigits, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null; // CNPJ inválido, API fora do ar ou sem conexão: segue sem os dados extras.
  } finally {
    clearTimeout(timeout);
  }
}

signupForm.addEventListener('submit', async event => {
  event.preventDefault();

  const name = signupForm.name.value.trim();
  const companyRaw = signupForm.company.value.trim();
  const phoneRaw = signupForm.phone.value.trim();
  const phoneDigits = phoneRaw.replace(/\D/g, '');
  const email = signupForm.email.value.trim();
  const city = signupForm.city.value.trim();
  const interest = signupForm.interest.value;
  const cnpjDigits = companyRaw.replace(/\D/g, '');

  signupForm.querySelectorAll('.form-row').forEach(row => row.classList.remove('invalid'));
  let valid = true;

  if (!name) {
    document.getElementById('signupName').closest('.form-row').classList.add('invalid');
    valid = false;
  }
  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    document.getElementById('signupPhone').closest('.form-row').classList.add('invalid');
    valid = false;
  }

  if (!valid) {
    contactStatus.textContent = 'Confira os campos destacados antes de enviar.';
    return;
  }

  if (!validPhone) {
    contactStatus.textContent = 'Nosso canal de atendimento está em atualização. Assim que estiver disponível, seu cadastro poderá ser enviado por aqui.';
    return;
  }

  // Abre a aba do WhatsApp já aqui, ainda no gesto síncrono do clique, para o
  // navegador não bloquear o popup enquanto a consulta do CNPJ roda depois.
  const whatsappTab = window.open('', '_blank');

  signupSubmit.disabled = true;

  let cnpjData = null;
  if (cnpjDigits.length === 14) {
    contactStatus.textContent = 'Consultando CNPJ...';
    cnpjData = await lookupCnpj(cnpjDigits);
  }

  let message = 'Olá! Gostaria de fazer meu cadastro de parceiro (' + interest + ').';
  message += '\nNome: ' + name + '\nTelefone: ' + phoneRaw;

  if (cnpjData) {
    message += '\nCNPJ: ' + cnpjDigits;
    if (cnpjData.razao_social) message += '\nRazão social: ' + cnpjData.razao_social;
    if (cnpjData.nome_fantasia) message += '\nNome fantasia: ' + cnpjData.nome_fantasia;
    if (cnpjData.descricao_situacao_cadastral) message += '\nSituação cadastral: ' + cnpjData.descricao_situacao_cadastral;
    const endereco = [cnpjData.logradouro, cnpjData.numero].filter(Boolean).join(', ');
    const cidadeUf = [cnpjData.municipio, cnpjData.uf].filter(Boolean).join('/');
    const enderecoCompleto = [endereco, cnpjData.bairro, cidadeUf].filter(Boolean).join(' - ');
    if (enderecoCompleto) message += '\nEndereço: ' + enderecoCompleto;
  } else if (companyRaw) {
    message += '\nEmpresa/CNPJ: ' + companyRaw;
  }

  if (email) message += '\nE-mail: ' + email;
  if (city) message += '\nCidade/Estado: ' + city;

  const finalUrl = whatsappUrl(message);
  if (whatsappTab) {
    whatsappTab.location.href = finalUrl;
    whatsappTab.opener = null; // corta a referência da nova aba, mesma proteção do rel=noopener.
  } else {
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  }

  signupSubmit.disabled = false;
  contactStatus.textContent = 'Cadastro enviado! Você será direcionado ao WhatsApp para concluir o atendimento.';
  signupForm.reset();
});
if (CONFIG.videoUrl) {
  try {
    const url = new URL(CONFIG.videoUrl);
    if (url.protocol === 'https:' && ['www.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname) && /^\/embed\/[\w-]+$/.test(url.pathname)) {
      const frame = document.createElement('iframe');
      frame.src = url.href;
      frame.title = 'Vídeo institucional SOU + BLU';
      frame.loading = 'lazy';
      frame.allowFullscreen = true;
      frame.className = 'configured-video';
      const host = document.querySelector('.about-mark') || document.querySelector('.video-heading');
      if (host) host.replaceWith(frame);
    }
  } catch { /* Mantém a apresentação da marca se a URL estiver incompleta. */ }
}

// Entradas progressivas: o conteúdo continua visível sem JavaScript.
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let revealObserver;
function configureReveals() {
  revealObserver?.disconnect();
  document.querySelectorAll('.reveal-pending').forEach(element => element.classList.remove('reveal-pending'));
  if (motionPreference.matches || !('IntersectionObserver' in window)) return;
  revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.remove('reveal-pending');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.section-heading, .solution-card, .benefit, .step, .why-copy, .about-mark, .video-heading, .accordion details, .contact-box').forEach(element => {
    element.classList.add('reveal-item');
    // Não ocultar conteúdo que já está na tela ou acima dela.
    if (element.getBoundingClientRect().top < innerHeight) return;
    element.classList.add('reveal-pending');
    revealObserver.observe(element);
  });
}
configureReveals();
motionPreference.addEventListener('change', configureReveals);
// A navegação por teclado nunca deixa o foco em um elemento oculto.
document.addEventListener('focusin', event => {
  const element = event.target.closest('.reveal-pending');
  if (element) {
    element.classList.remove('reveal-pending');
    revealObserver?.unobserve(element);
  }
});
