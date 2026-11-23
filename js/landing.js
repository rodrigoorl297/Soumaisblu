// Edite somente estes campos quando os canais oficiais estiverem disponíveis.
const CONFIG = {
  whatsapp: "5511962736167", // Código do país + DDD + número, só dígitos. Vazio = botão de WhatsApp oculto.
  videoUrl: "", // URL de incorporação: https://www.youtube.com/embed/ID
};

const heroCarousel = document.getElementById("heroCarousel");
const heroCarouselDots = document.getElementById("heroCarouselDots");
const heroCarouselPause = document.getElementById("heroCarouselPause");
if (heroCarousel && heroCarouselDots && heroCarouselPause) {
  const track = heroCarousel.querySelector(".hero-carousel-track");
  const slides = [...track.children];
  const dots = [...heroCarouselDots.querySelectorAll("button")];
  const carouselControls = heroCarouselPause.closest(".carousel-controls");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let activeIndex = 0;
  let timer = null;
  let isPaused = reducedMotion.matches;

  function showSlide(index) {
    activeIndex = (index + slides.length) % slides.length;
    track.style.transform = `translateX(-${activeIndex * 100}%)`;
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === activeIndex);
      dot.setAttribute("aria-pressed", String(dotIndex === activeIndex));
    });
    slides.forEach((slide, slideIndex) => {
      slide.inert = slideIndex !== activeIndex;
      slide.setAttribute("aria-hidden", String(slideIndex !== activeIndex));
    });
  }

  function stopAutoplay() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function startAutoplay() {
    stopAutoplay();
    if (isPaused || document.hidden || heroCarousel.parentElement.matches(":hover, :focus-within"))
      return;
    timer = setInterval(() => showSlide(activeIndex + 1), 6000);
  }

  function updatePauseControl() {
    heroCarouselPause.textContent = isPaused ? "Reproduzir" : "Pausar";
    heroCarouselPause.setAttribute("aria-pressed", String(isPaused));
  }

  dots.forEach((dot, index) =>
    dot.addEventListener("click", () => {
      showSlide(index);
      startAutoplay();
    }),
  );
  [heroCarousel, carouselControls].forEach((element) => {
    element.addEventListener("mouseenter", stopAutoplay);
    element.addEventListener("mouseleave", startAutoplay);
    element.addEventListener("focusin", stopAutoplay);
    element.addEventListener("focusout", () => setTimeout(startAutoplay, 0));
  });
  heroCarouselPause.addEventListener("click", () => {
    isPaused = !isPaused;
    updatePauseControl();
    startAutoplay();
  });
  reducedMotion.addEventListener("change", () => {
    isPaused = reducedMotion.matches;
    updatePauseControl();
    startAutoplay();
  });
  document.addEventListener("visibilitychange", startAutoplay);
  showSlide(0);
  updatePauseControl();
  startAutoplay();
}

if (CONFIG.videoUrl && document.querySelector(".about-mark")) {
  try {
    const url = new URL(CONFIG.videoUrl);
    if (
      url.protocol === "https:" &&
      ["www.youtube.com", "www.youtube-nocookie.com"].includes(url.hostname) &&
      /^\/embed\/[\w-]+$/.test(url.pathname)
    ) {
      const frame = document.createElement("iframe");
      frame.src = url.href;
      frame.title = "Vídeo institucional SOU + BLU";
      frame.loading = "lazy";
      frame.allowFullscreen = true;
      frame.className = "configured-video";
      document.querySelector(".about-mark").replaceWith(frame);
    }
  } catch {
    /* Mantém a apresentação da marca se a URL estiver incompleta. */
  }
}

const maskCpfCnpj = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

const maskPhone = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
};

document.getElementById("partnerDocument")?.addEventListener("input", function () {
  this.value = maskCpfCnpj(this.value);
});
document.getElementById("partnerCommercialPhone")?.addEventListener("input", function () {
  this.value = maskPhone(this.value);
});
document.getElementById("partnerWhatsappPhone")?.addEventListener("input", function () {
  this.value = maskPhone(this.value);
});

const partnerForm = document.getElementById("partnerForm");
const partnerFormStatus = document.getElementById("partnerFormStatus");
const markInvalid = (id, invalid) => {
  const field = document.getElementById(id);
  field?.closest(".form-field")?.classList.toggle("is-invalid", invalid);
  field?.setAttribute("aria-invalid", String(invalid));
};
partnerForm?.addEventListener("input", (event) => {
  if (event.target.id) markInvalid(event.target.id, false);
});
document.getElementById("partnerTerms")?.addEventListener("change", (event) => {
  event.target.closest(".form-checkbox").classList.remove("is-invalid");
});
if (partnerForm && partnerFormStatus) {
  partnerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(partnerForm).entries());
    const name = (data.name || "").trim();
    const partnerDocument = (data.document || "").trim();
    const commercialPhone = (data.commercialPhone || "").trim();
    const commercialEmail = (data.commercialEmail || "").trim();
    const termsAccepted = partnerForm.elements.terms.checked;

    const missing = [
      ["partnerName", !name],
      ["partnerDocument", !partnerDocument],
      ["partnerCommercialPhone", !commercialPhone],
      ["partnerCommercialEmail", !commercialEmail],
    ];
    missing.forEach(([id, isMissing]) => markInvalid(id, isMissing));
    partnerForm.querySelector(".form-checkbox").classList.toggle("is-invalid", !termsAccepted);

    if (missing.some(([, isMissing]) => isMissing)) {
      partnerFormStatus.textContent =
        "Preencha nome, CNPJ/CPF, e-mail comercial e contato comercial para continuar.";
      partnerFormStatus.className = "is-error";
      const firstMissing = missing.find(([, isMissing]) => isMissing);
      document.getElementById(firstMissing[0]).focus();
      return;
    }
    if (!termsAccepted) {
      partnerFormStatus.textContent =
        "É necessário aceitar os Termos e Condições de Uso para continuar.";
      partnerFormStatus.className = "is-error";
      document.getElementById("partnerTerms").focus();
      return;
    }

    const record = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      name,
      document: partnerDocument,
      commercialPhone,
      whatsappPhone: (data.whatsappPhone || "").trim(),
      commercialEmail,
      financialEmail: (data.financialEmail || "").trim(),
      city: (data.city || "").trim(),
      contactTime: data.contactTime || "",
      worksCommercial: data.worksCommercial || "",
      hasAddress: data.hasAddress || "",
      creditExperience: data.creditExperience || "",
      message: (data.message || "").trim(),
    };
    const submitButton = partnerForm.querySelector('[type="submit"]');
    const submitLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Enviando...";
    partnerFormStatus.textContent = "";
    partnerFormStatus.className = "";

    // Só confirma depois que o servidor gravou o cadastro no banco.
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch("/api/parceiros.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.error("Cadastro não enviado:", error);
      partnerFormStatus.textContent =
        "Não foi possível enviar o cadastro agora. Seus dados continuam no formulário, tente novamente em instantes.";
      partnerFormStatus.className = "is-error";
      submitButton.disabled = false;
      submitButton.textContent = submitLabel;
      return;
    }

    // CNPJ: consulta feita no servidor, depois que o cadastro existe no banco.
    // O resultado fica salvo no cadastro e não volta para esta página.
    if (partnerDocument.replace(/\D/g, "").length === 14) {
      fetch("/api/consulta-cnpj.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id, cnpj: partnerDocument, partnerName: name }),
        keepalive: true,
      }).catch(() => {});
    }

    partnerFormStatus.textContent =
      "Cadastro salvo! Nossa equipe vai entrar em contato pelos dados informados.";
    partnerFormStatus.className = "is-success";
    partnerForm.reset();
    submitButton.disabled = false;
    submitButton.textContent = submitLabel;
  });
}

// Blocos aparecem ao rolar; sem JavaScript o conteúdo já fica visível.
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let revealObserver;
function configureReveals() {
  revealObserver?.disconnect();
  document
    .querySelectorAll(".reveal-pending")
    .forEach((element) => element.classList.remove("reveal-pending"));
  if (motionPreference.matches || !("IntersectionObserver" in window)) return;
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove("reveal-pending");
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.08 },
  );
  document
    .querySelectorAll(
      ".section-heading, .about-mark, .about-copy, .solutions-grid, .steps-list, .accordion, .partners-form",
    )
    .forEach((element) => {
      element.classList.add("reveal-item");
      // Não ocultar conteúdo que já está na tela ou acima dela.
      if (element.getBoundingClientRect().top < innerHeight) return;
      element.classList.add("reveal-pending");
      revealObserver.observe(element);
    });
}
configureReveals();
motionPreference.addEventListener("change", configureReveals);

// Foco por teclado nunca fica em elemento oculto.
document.addEventListener("focusin", (event) => {
  const element = event.target.closest(".reveal-pending");
  if (element) {
    element.classList.remove("reveal-pending");
    revealObserver?.unobserve(element);
  }
});

/**
 * Cookie banner (LGPD) — consentimento na landing /cadastro.
 * Guarda escolha em localStorage; links apontam para as mesmas políticas do rodapé.
 */
(function initCookieBanner() {
  const KEY = "soublu_cookie_consent_v1";
  const banner = document.getElementById("cookieBanner");
  const acceptBtn = document.getElementById("cookieAcceptBtn");
  const rejectBtn = document.getElementById("cookieRejectBtn");
  if (!banner || !acceptBtn || !rejectBtn) return;

  let stored = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch (_) {
    stored = null;
  }
  if (stored === "accepted" || stored === "essential") return;

  banner.hidden = false;

  const save = (value) => {
    try {
      localStorage.setItem(KEY, value);
    } catch (_) {
      /* private mode */
    }
    banner.hidden = true;
    document.dispatchEvent(
      new CustomEvent("soublu:cookie-consent", { detail: { value } })
    );
  };

  acceptBtn.addEventListener("click", () => save("accepted"));
  rejectBtn.addEventListener("click", () => save("essential"));
})();
