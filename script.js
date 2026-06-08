const floatingNav = document.querySelector(".float-nav");
const navLinks = [...document.querySelectorAll(".pill-nav a, .float-nav a")];
const sections = ["home", "work", "play", "talks"].map((id) => document.getElementById(id)).filter(Boolean);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if ("scrollRestoration" in history) history.scrollRestoration = "auto";
document.documentElement.classList.add("motion-ready");

const revealTargets = [
  ".hero-card",
  ".case-card",
  ".year-mark",
  ".writing-grid article",
  ".talk-entry",
  ".quote-collage img",
  ".footer",
]
  .flatMap((selector) => [...document.querySelectorAll(selector)])
  .filter(Boolean);

revealTargets.forEach((target, index) => {
  target.classList.add("reveal");
  target.style.setProperty("--stagger", String(index % 5));
  if (target.matches(".case-media, .app-stage, .writing-grid img, .entry-media")) {
    target.dataset.reveal = "clip";
  }
});

if (reduceMotion || !("IntersectionObserver" in window)) {
  revealTargets.forEach((target) => target.classList.add("in-view"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
  );
  revealTargets.forEach((target) => revealObserver.observe(target));
}

const proofCollageNode = document.querySelector(".proof-collage");
if (proofCollageNode) {
  if (reduceMotion || !("IntersectionObserver" in window)) {
    proofCollageNode.classList.add("in-view");
  } else {
    const proofObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            proofCollageNode.classList.add("in-view");
            proofObserver.unobserve(proofCollageNode);
          }
        });
      },
      { threshold: 0.25, rootMargin: "0px 0px -8% 0px" }
    );
    proofObserver.observe(proofCollageNode);
  }
}

const animatedNumbers = [...document.querySelectorAll("[data-count]")];

function formatCount(value, format) {
  if (format === "star") return `${Math.round(value)}`;
  if (format === "star-label") return `${Math.round(value)}star`;
  if (format === "plus") return `${Math.round(value)}+`;
  if (format === "w") return `${value.toFixed(1)}w`;
  if (format === "w-plus") return `${Math.round(value)}w+`;
  if (format === "comma") return Math.round(value).toLocaleString("en-US");
  return String(Math.round(value));
}

function animateCount(element, force = false) {
  if (!element || reduceMotion) return;
  if (element.dataset.counted === "true" && !force) return;
  element.dataset.counted = "true";
  const target = Number(element.dataset.count || 0);
  const format = element.dataset.format || "";
  const start = performance.now();
  const duration = Number(element.dataset.duration || 1050);

  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = formatCount(target * eased, format);
    if (progress < 1) requestAnimationFrame(tick);
    else element.textContent = formatCount(target, format);
  }

  requestAnimationFrame(tick);
}

document.querySelectorAll(".hero-metrics span, .hero-metrics a").forEach((metric, index) => {
  metric.style.setProperty("--metric-index", String(index));
});

if (reduceMotion || !("IntersectionObserver" in window)) {
  animatedNumbers.forEach((number) => animateCount(number, true));
} else {
  document.querySelectorAll(".hero-metrics [data-count]").forEach((number) => {
    number.textContent = formatCount(Number(number.dataset.count || 0), number.dataset.format || "");
    number.dataset.counted = "true";
  });
  const numberObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          numberObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.55 }
  );
  animatedNumbers.filter((number) => number.dataset.counted !== "true").forEach((number) => numberObserver.observe(number));
}

function setActive(id) {
  navLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    link.classList.toggle("active", href === `#${id}`);
  });
}

function getCurrentSectionId() {
  const marker = window.scrollY + 168;
  let current = sections[0];
  sections.forEach((section) => {
    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    if (sectionTop <= marker) current = section;
  });
  return current?.id;
}

function navIdForTarget(target) {
  if (!target) return null;
  if (target.id && sections.some((section) => section.id === target.id)) return target.id;
  if (target.closest("#work")) return "work";
  if (target.closest("#play")) return "play";
  if (target.closest("#talks")) return "talks";
  return getCurrentSectionId();
}

function updateNavState() {
  const currentId = getCurrentSectionId();
  if (currentId) setActive(currentId);
}

function getAnchorOffset() {
  return window.matchMedia("(max-width: 760px)").matches ? 92 : 118;
}

function alignHashTarget(target, navId) {
  if (!target) return false;
  const offset = getAnchorOffset();
  const targetTop = target.getBoundingClientRect().top + window.scrollY - offset;
  const scrollTop = Math.max(0, Math.round(targetTop));
  window.scrollTo({ top: scrollTop, behavior: "auto" });
  if (navId) setActive(navId);
  return Math.abs(target.getBoundingClientRect().top - offset) < 8;
}

window.addEventListener("scroll", () => {
  floatingNav.classList.toggle("visible", window.scrollY > 220);
  updateNavState();
  if (!reduceMotion) {
    const hero = document.querySelector(".hero-card");
    if (hero) {
      const rect = hero.getBoundingClientRect();
      const drift = Math.max(-1, Math.min(1, rect.top / window.innerHeight));
      hero.style.setProperty("--my", `${drift * 18}px`);
    }
    const proofCollage = document.querySelector(".proof-collage");
    if (proofCollage) {
      const rect = proofCollage.getBoundingClientRect();
      const centerDistance = rect.top + rect.height * 0.5 - window.innerHeight * 0.5;
      const shift = Math.max(-32, Math.min(32, centerDistance * -0.05));
      proofCollage.style.setProperty("--proof-shift", `${shift.toFixed(2)}px`);
    }
  }
});

const heroCard = document.querySelector(".hero-card");
if (heroCard && !reduceMotion) {
  heroCard.addEventListener("pointermove", (event) => {
    const rect = heroCard.getBoundingClientRect();
    const mx = ((event.clientX - rect.left) / rect.width - 0.5) * 28;
    const my = ((event.clientY - rect.top) / rect.height - 0.5) * 24;
    heroCard.style.setProperty("--mx", `${mx}px`);
    heroCard.style.setProperty("--my", `${my}px`);
  });
  heroCard.addEventListener("pointerleave", () => {
    heroCard.style.setProperty("--mx", "0px");
    heroCard.style.setProperty("--my", "0px");
  });
}

const autoplayVideos = [...document.querySelectorAll("video[autoplay]")];
if (autoplayVideos.length) {
  const playAutoplayVideos = () => {
    autoplayVideos.forEach((video) => {
      const rect = video.getBoundingClientRect();
      const isNearViewport = rect.bottom > -160 && rect.top < window.innerHeight + 320;
      if (!isNearViewport) return;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});
    });
  };
  if (!reduceMotion) {
    window.setTimeout(playAutoplayVideos, 250);
    window.addEventListener("scroll", playAutoplayVideos, { passive: true });
    ["pointermove", "pointerdown", "touchstart"].forEach((eventName) => {
      window.addEventListener(eventName, playAutoplayVideos, { once: true, passive: true });
    });
  }
}

document.querySelectorAll("[data-intro-tile]").forEach((tile) => {
  const video = tile.querySelector("video");
  const hint = tile.querySelector(".motion-hint");
  if (!video) return;

  tile.addEventListener("click", (event) => {
    event.preventDefault();
    video.muted = false;
    video.controls = true;
    video.loop = false;
    video.currentTime = Math.max(0, video.currentTime || 0);
    tile.classList.add("is-playing-sound");
    if (hint) hint.textContent = "有声播放中";
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});
  });
});

function scrollToHash(hash) {
  if (!hash || hash.length < 2) return;
  const target = document.querySelector(hash);
  if (!target) return;
  const navId = navIdForTarget(target);
  const align = () => alignHashTarget(target, navId);
  align();
  window.requestAnimationFrame(align);
  window.setTimeout(align, 120);
  window.setTimeout(align, 360);
  window.setTimeout(align, 900);
  window.setTimeout(align, 1900);
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const hash = link.getAttribute("href");
    if (!hash || hash === "#") return;
    const target = document.querySelector(hash);
    const navId = navIdForTarget(target);
    if (navId) setActive(navId);
    window.setTimeout(updateNavState, 360);
  });
});

window.addEventListener("hashchange", () => {
  const target = document.querySelector(window.location.hash);
  const navId = navIdForTarget(target);
  if (navId) setActive(navId);
  window.setTimeout(updateNavState, 360);
});
window.setTimeout(updateNavState, 420);

const appButtons = [...document.querySelectorAll(".app-dots button")];
const tractionCards = [...document.querySelectorAll(".traction-card")];
const tractionStage = document.querySelector(".traction-stage");
let appIndex = appButtons.findIndex((button) => button.classList.contains("selected"));
if (appIndex < 0) appIndex = 0;
let metricTimer = null;

function selectApp(index) {
  if (!appButtons.length) return;
  appIndex = (index + appButtons.length) % appButtons.length;
  appButtons.forEach((button, i) => button.classList.toggle("selected", i === appIndex));
  tractionCards.forEach((card, i) => card.classList.toggle("selected", i === appIndex));

  const activeCard = tractionCards[appIndex];
  if (activeCard) {
    activeCard.animate(
      [
        { opacity: 0.55, transform: "translateY(18px) scale(0.98)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      { duration: reduceMotion ? 1 : 320, easing: "ease-out" }
    );
    animateCount(activeCard.querySelector("[data-count]"), true);
  }
}

function stopMetricAutoPlay() {
  if (metricTimer) window.clearInterval(metricTimer);
  metricTimer = null;
}

function startMetricAutoPlay() {
  if (reduceMotion || appButtons.length < 2 || metricTimer) return;
  metricTimer = window.setInterval(() => selectApp(appIndex + 1), 4200);
}

function restartMetricAutoPlay() {
  stopMetricAutoPlay();
  window.setTimeout(startMetricAutoPlay, 5200);
}

appButtons.forEach((button, index) =>
  button.addEventListener("click", () => {
    selectApp(index);
    restartMetricAutoPlay();
  })
);
document.querySelector(".carousel-arrow.left")?.addEventListener("click", () => {
  selectApp(appIndex - 1);
  restartMetricAutoPlay();
});
document.querySelector(".carousel-arrow.right")?.addEventListener("click", () => {
  selectApp(appIndex + 1);
  restartMetricAutoPlay();
});

if (tractionStage && !reduceMotion) {
  const metricObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) startMetricAutoPlay();
        else stopMetricAutoPlay();
      });
    },
    { threshold: 0.42 }
  );
  metricObserver.observe(tractionStage);
  tractionStage.addEventListener("mouseenter", stopMetricAutoPlay);
  tractionStage.addEventListener("mouseleave", startMetricAutoPlay);
  tractionStage.addEventListener("focusin", stopMetricAutoPlay);
  tractionStage.addEventListener("focusout", startMetricAutoPlay);
}

document.querySelectorAll("[data-auto-slider]").forEach((slider) => {
  const slides = [...slider.querySelectorAll("[data-slide]")];
  if (!slides.length) return;
  let index = Math.max(0, slides.findIndex((slide) => slide.classList.contains("selected")));
  let timer = null;

  function selectSlide(nextIndex) {
    index = (nextIndex + slides.length) % slides.length;
    slider.dataset.activeSlide = String(index);
    slides.forEach((slide, slideIndex) => {
      const selected = slideIndex === index;
      slide.classList.toggle("selected", selected);
      const video = slide.querySelector("video");
      if (video && selected && !reduceMotion) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});
      }
    });
  }

  function stopSlider() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  function startSlider() {
    if (reduceMotion || slides.length < 2 || timer) return;
    timer = window.setInterval(() => selectSlide(index + 1), 3200);
  }

  selectSlide(index);
  slider.addEventListener("mouseenter", stopSlider);
  slider.addEventListener("mouseleave", startSlider);
  slider.addEventListener("focusin", stopSlider);
  slider.addEventListener("focusout", startSlider);

  if ("IntersectionObserver" in window && !reduceMotion) {
    const sliderObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) startSlider();
          else stopSlider();
        });
      },
      { threshold: 0.36 }
    );
    sliderObserver.observe(slider);
  } else {
    startSlider();
  }
});

document.querySelectorAll("[data-auto-rail]").forEach((rail) => {
  const track = rail.querySelector("[data-auto-rail-track]");
  const cards = [...rail.querySelectorAll(".spread-card")];
  if (!track || cards.length < 2) return;
  let index = 0;
  let timer = null;

  function scrollToCard(nextIndex) {
    index = (nextIndex + cards.length) % cards.length;
    const target = cards[index];
    track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: "smooth" });
  }

  function stopRail() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  function startRail() {
    if (reduceMotion || timer) return;
    timer = window.setInterval(() => scrollToCard(index + 1), 2800);
  }

  track.addEventListener("mouseenter", stopRail);
  track.addEventListener("mouseleave", startRail);
  track.addEventListener("focusin", stopRail);
  track.addEventListener("focusout", startRail);

  if ("IntersectionObserver" in window && !reduceMotion) {
    const railObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) startRail();
          else stopRail();
        });
      },
      { threshold: 0.28 }
    );
    railObserver.observe(rail);
  } else {
    startRail();
  }
});

document.querySelectorAll("[data-case-switcher]").forEach((switcher) => {
  const buttons = [...switcher.querySelectorAll("[data-case-view-button]")];
  const views = [...switcher.querySelectorAll("[data-case-view]")];
  const selectCaseView = (name) => {
    buttons.forEach((button) => {
      const selected = button.dataset.caseViewButton === name;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
    views.forEach((view) => {
      const selected = view.dataset.caseView === name;
      view.hidden = !selected;
      view.classList.toggle("selected", selected);
    });
  };
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      selectCaseView(button.dataset.caseViewButton);
    });
  });
  selectCaseView(buttons.find((button) => button.classList.contains("selected"))?.dataset.caseViewButton || "use");
});

document.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => {
    button.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(0.96)" },
        { transform: "scale(1)" },
      ],
      { duration: 180, easing: "ease-out" }
    );
  });
});

const toast = document.createElement("div");
toast.className = "micro-toast";
toast.textContent = "已打开";
document.body.append(toast);

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1200);
}

document.querySelectorAll(".read-chip, .small-chip, .green-btn, .outline-link, .black-btn, .tap-explore").forEach((control) => {
  control.addEventListener("click", () => {
    if (control.classList.contains("small-chip")) showToast("查看验证数据");
    else if (control.classList.contains("black-btn")) showToast("打开 GitHub");
    else showToast("查看详情");
  });
});
