<template>
  <div class="landing-page">
    <Transition name="landing-intro">
      <div
        v-if="showIntro"
        class="landing-intro"
        role="status"
        aria-live="polite"
        :aria-label="t('landing.loader.aria')"
      >
        <div class="landing-intro__glow landing-intro__glow--one"></div>
        <div class="landing-intro__glow landing-intro__glow--two"></div>
        <div class="landing-intro__content">
          <div class="landing-intro__book" aria-hidden="true">
            <span class="landing-intro__back"></span>
            <span class="landing-intro__page landing-intro__page--one"></span>
            <span class="landing-intro__page landing-intro__page--two"></span>
            <span class="landing-intro__page landing-intro__page--three"></span>
            <span class="landing-intro__cover">
              <i></i><i></i><i></i>
            </span>
          </div>
          <div class="landing-intro__wordmark">
            <span>CROS</span>
            <small>CARGO OPERATIONS SUITE</small>
          </div>
          <p>{{ t("landing.loader.copy") }}</p>
          <div class="landing-intro__progress" aria-hidden="true"><i></i></div>
        </div>
        <button type="button" class="landing-intro__skip" @click="finishIntro">
          {{ t("landing.loader.skip") }}
        </button>
      </div>
    </Transition>

    <header class="landing-header">
      <a class="landing-brand" href="#landing-top" :aria-label="t('landing.brandAria')">
        <span class="landing-brand__mark" aria-hidden="true">
          <i></i><i></i><i></i>
        </span>
        <span class="landing-brand__copy">
          <strong>CROS</strong>
          <small>Cargo Operations Suite</small>
        </span>
      </a>

      <nav class="landing-nav" :aria-label="t('landing.nav.aria')">
        <a href="#landing-top">{{ t("landing.nav.home") }}</a>
        <a href="#landing-capabilities">{{ t("landing.nav.capabilities") }}</a>
        <a class="landing-nav__tracking" :href="trackingEntryPath">
          {{ t("landing.nav.tracking") }}
          <span>{{ t("landing.status.public") }}</span>
        </a>
        <a href="#landing-roadmap">{{ t("landing.nav.roadmap") }}</a>
        <a href="#landing-about">{{ t("landing.nav.about") }}</a>
      </nav>

      <div class="landing-header__actions">
        <LanguageSwitcher class="landing-language" />
        <RouterLink class="landing-entry-button" :to="platformEntryPath">
          <span>{{ platformEntryLabel }}</span>
          <el-icon><ArrowRight /></el-icon>
        </RouterLink>
      </div>
    </header>

    <main>
      <section
        id="landing-top"
        class="landing-hero"
        @mouseenter="stopAutoplay"
        @mouseleave="startAutoplay"
        @focusin="stopAutoplay"
        @focusout="startAutoplay"
      >
        <Transition name="landing-hero-page" mode="out-in">
          <article
            :key="currentSlide.id"
            class="landing-hero__slide"
            :style="{ backgroundImage: `url(${currentSlide.image})` }"
          >
            <div class="landing-hero__wash"></div>
            <div class="landing-hero__angle landing-hero__angle--left"></div>
            <div class="landing-hero__angle landing-hero__angle--right"></div>
            <div class="landing-hero__grid" aria-hidden="true"></div>

            <div class="landing-hero__inner">
              <div class="landing-hero__content">
                <p class="landing-kicker">
                  <span></span>
                  {{ currentSlide.kicker }}
                </p>
                <h1>{{ currentSlide.title }}</h1>
                <p class="landing-hero__description">{{ currentSlide.description }}</p>
                <div class="landing-hero__actions">
                  <a class="landing-button landing-button--primary" :href="currentSlide.primaryHref">
                    {{ currentSlide.primaryLabel }}
                    <el-icon><ArrowRight /></el-icon>
                  </a>
                  <a class="landing-button landing-button--ghost" href="#landing-capabilities">
                    {{ t("landing.hero.explore") }}
                  </a>
                </div>
              </div>

              <div class="landing-hero__signal" aria-hidden="true">
                <div class="landing-hero__signal-head">
                  <span>{{ t("landing.hero.signalEyebrow") }}</span>
                  <i></i>
                </div>
                <div class="landing-hero__route">
                  <span>SHA</span>
                  <div><i></i><b></b><i></i></div>
                  <span>LAX</span>
                </div>
                <div class="landing-hero__signal-foot">
                  <span>{{ t("landing.hero.signalStatus") }}</span>
                  <strong>02 / 04</strong>
                </div>
              </div>
            </div>
          </article>
        </Transition>

        <div class="landing-hero__footer">
          <div class="landing-hero__pagination" :aria-label="t('landing.hero.paginationAria')">
            <button
              v-for="(slide, index) in slides"
              :key="slide.id"
              type="button"
              :class="{ active: activeSlideIndex === index }"
              :aria-label="t('landing.hero.goToSlide', { index: index + 1 })"
              :aria-pressed="activeSlideIndex === index"
              @click="goToSlide(index)"
            >
              <span>{{ String(index + 1).padStart(2, "0") }}</span>
              <i></i>
            </button>
          </div>
          <div class="landing-hero__arrows">
            <button type="button" :aria-label="t('landing.hero.previous')" @click="previousSlide">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <button type="button" :aria-label="t('landing.hero.next')" @click="nextSlide">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </section>

      <section id="landing-capabilities" class="landing-capabilities" :aria-label="t('landing.capabilities.aria')">
        <div class="landing-capabilities__grid">
          <a
            v-for="item in capabilities"
            :key="item.id"
            class="landing-capability-card"
            :class="[`landing-capability-card--${item.id}`, { 'is-public': item.status === 'public' }]"
            :href="item.href"
          >
            <span class="landing-capability-card__number">{{ item.number }}</span>
            <span class="landing-capability-card__icon"><el-icon><component :is="item.icon" /></el-icon></span>
            <div class="landing-capability-card__status">
              <i></i>
              {{ item.statusLabel }}
            </div>
            <h2>{{ item.title }}</h2>
            <p>{{ item.description }}</p>
            <span class="landing-capability-card__link">
              {{ item.actionLabel }}
              <el-icon><ArrowRight /></el-icon>
            </span>
          </a>
        </div>
      </section>

      <section id="landing-about" class="landing-statement">
        <div class="landing-section-heading landing-section-heading--center">
          <p>{{ t("landing.statement.eyebrow") }}</p>
          <h2>{{ t("landing.statement.title") }}</h2>
          <span>{{ t("landing.statement.description") }}</span>
        </div>
        <div class="landing-statement__actions">
          <a class="landing-pill landing-pill--dark" :href="trackingEntryPath">
            <el-icon><Search /></el-icon>
            {{ t("landing.statement.track") }}
          </a>
          <RouterLink class="landing-pill landing-pill--blue" :to="platformEntryPath">
            <el-icon><Monitor /></el-icon>
            {{ platformEntryLabel }}
          </RouterLink>
        </div>
        <div class="landing-statement__metrics">
          <div>
            <strong>02</strong>
            <span>{{ t("landing.statement.metricOnline") }}</span>
          </div>
          <div>
            <strong>01</strong>
            <span>{{ t("landing.statement.metricPublic") }}</span>
          </div>
          <div>
            <strong>04</strong>
            <span>{{ t("landing.statement.metricRoadmap") }}</span>
          </div>
        </div>
      </section>

      <section id="landing-roadmap" class="landing-roadmap">
        <div class="landing-roadmap__visual" aria-hidden="true">
          <div class="landing-roadmap__orb landing-roadmap__orb--one"></div>
          <div class="landing-roadmap__orb landing-roadmap__orb--two"></div>
          <div class="landing-roadmap__console">
            <div class="landing-roadmap__console-head">
              <span>CROS / LIVE OPERATIONS</span>
              <i></i>
            </div>
            <div class="landing-roadmap__route-line">
              <span>01</span><i></i><span>02</span><i></i><span>03</span><i></i><span>04</span>
            </div>
            <div class="landing-roadmap__modules">
              <div class="is-live"><el-icon><Box /></el-icon><span>LOAD</span></div>
              <div class="is-public"><el-icon><Search /></el-icon><span>TRACK</span></div>
              <div><el-icon><Ship /></el-icon><span>BOOK</span></div>
              <div><el-icon><Connection /></el-icon><span>ERP</span></div>
            </div>
            <div class="landing-roadmap__console-foot">
              <span>{{ t("landing.roadmap.currentLabel") }}</span>
              <strong>2 / 4</strong>
            </div>
          </div>
        </div>

        <div class="landing-roadmap__content">
          <div class="landing-section-heading">
            <p>{{ t("landing.roadmap.eyebrow") }}</p>
            <h2>{{ t("landing.roadmap.title") }}</h2>
            <span>{{ t("landing.roadmap.description") }}</span>
          </div>
          <div class="landing-roadmap__stages">
            <div class="is-current">
              <span>{{ t("landing.roadmap.currentLabel") }}</span>
              <strong>{{ t("landing.roadmap.currentTitle") }}</strong>
              <p>{{ t("landing.roadmap.currentDescription") }}</p>
            </div>
            <div>
              <span>{{ t("landing.roadmap.nextLabel") }}</span>
              <strong>{{ t("landing.roadmap.nextTitle") }}</strong>
              <p>{{ t("landing.roadmap.nextDescription") }}</p>
            </div>
          </div>
          <RouterLink class="landing-text-link" :to="platformEntryPath">
            {{ t("landing.roadmap.viewWorkspaces") }}
            <el-icon><ArrowRight /></el-icon>
          </RouterLink>
        </div>
      </section>

      <section class="landing-cta">
        <div>
          <p>{{ t("landing.cta.eyebrow") }}</p>
          <h2>{{ t("landing.cta.title") }}</h2>
          <span>{{ t("landing.cta.description") }}</span>
        </div>
        <div class="landing-cta__actions">
          <a class="landing-button landing-button--light" :href="trackingEntryPath">
            {{ t("landing.cta.publicTracking") }}
            <el-icon><ArrowRight /></el-icon>
          </a>
          <RouterLink class="landing-button landing-button--outline" :to="platformEntryPath">
            {{ platformEntryLabel }}
          </RouterLink>
        </div>
      </section>
    </main>

    <footer class="landing-footer">
      <div class="landing-footer__brand">
        <span class="landing-brand__mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <div>
          <strong>CROS</strong>
          <p>{{ t("landing.footer.tagline") }}</p>
        </div>
      </div>
      <div class="landing-footer__links">
        <a href="#landing-capabilities">{{ t("landing.nav.capabilities") }}</a>
        <a href="#landing-roadmap">{{ t("landing.nav.roadmap") }}</a>
        <a :href="trackingEntryPath">Cargo Tracking</a>
        <RouterLink :to="platformEntryPath">{{ t("landing.footer.signIn") }}</RouterLink>
      </div>
      <div class="landing-footer__meta">
        <span>{{ t("landing.footer.copyright") }}</span>
        <span>{{ t("landing.footer.platform") }}</span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Connection,
  Monitor,
  OfficeBuilding,
  Search,
  Ship
} from "@element-plus/icons-vue";
import LanguageSwitcher from "./LanguageSwitcher.vue";
import { currentLocale, t } from "../i18n";

const props = defineProps<{
  currentUser?: { role?: string; username?: string; displayName?: string } | null;
}>();

const INTRO_STORAGE_KEY = "cros-public-landing-intro-v1";
const trackingEntryPath = import.meta.env.VITE_TRACKING_WORKBENCH_URL || "/tracking/";

function introWasSeen() {
  try {
    return sessionStorage.getItem(INTRO_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const showIntro = ref(!introWasSeen());
const activeSlideIndex = ref(0);
const reducedMotion = ref(false);
let introTimer = 0;
let autoplayTimer = 0;
let previousBodyOverflow = "";

const platformEntryPath = computed(() => props.currentUser?.role === "ADMIN" ? "/admin" : "/workbenches");
const platformEntryLabel = computed(() => {
  currentLocale.value;
  if (props.currentUser?.role === "ADMIN") return t("landing.entry.admin");
  if (props.currentUser) return t("landing.entry.open");
  return t("landing.entry.enter");
});

const slideImages = {
  platform: "https://images.unsplash.com/photo-1724597500306-a4cbb7d1324e?auto=format&fit=crop&w=2400&q=82",
  planning: "https://images.unsplash.com/photo-1670121180583-39ab653a071c?auto=format&fit=crop&w=2400&q=82",
  tracking: "https://images.unsplash.com/photo-1725100609222-86a51bee3c3a?auto=format&fit=crop&w=2400&q=82"
};

const slides = computed(() => {
  currentLocale.value;
  return [
    {
      id: "platform",
      image: slideImages.platform,
      kicker: t("landing.hero.slides.platform.kicker"),
      title: t("landing.hero.slides.platform.title"),
      description: t("landing.hero.slides.platform.description"),
      primaryLabel: platformEntryLabel.value,
      primaryHref: platformEntryPath.value
    },
    {
      id: "planning",
      image: slideImages.planning,
      kicker: t("landing.hero.slides.planning.kicker"),
      title: t("landing.hero.slides.planning.title"),
      description: t("landing.hero.slides.planning.description"),
      primaryLabel: t("landing.hero.slides.planning.action"),
      primaryHref: platformEntryPath.value
    },
    {
      id: "tracking",
      image: slideImages.tracking,
      kicker: t("landing.hero.slides.tracking.kicker"),
      title: t("landing.hero.slides.tracking.title"),
      description: t("landing.hero.slides.tracking.description"),
      primaryLabel: t("landing.hero.slides.tracking.action"),
      primaryHref: trackingEntryPath
    }
  ];
});

const currentSlide = computed(() => slides.value[activeSlideIndex.value] || slides.value[0]);

const capabilities = computed(() => {
  currentLocale.value;
  return [
    {
      id: "planning",
      number: "01",
      icon: Box,
      status: "live",
      statusLabel: t("landing.status.available"),
      title: t("landing.capabilities.planning.title"),
      description: t("landing.capabilities.planning.description"),
      actionLabel: t("landing.capabilities.planning.action"),
      href: platformEntryPath.value
    },
    {
      id: "tracking",
      number: "02",
      icon: Search,
      status: "public",
      statusLabel: t("landing.status.public"),
      title: t("landing.capabilities.tracking.title"),
      description: t("landing.capabilities.tracking.description"),
      actionLabel: t("landing.capabilities.tracking.action"),
      href: trackingEntryPath
    },
    {
      id: "booking",
      number: "03",
      icon: Ship,
      status: "planned",
      statusLabel: t("landing.status.planned"),
      title: t("landing.capabilities.booking.title"),
      description: t("landing.capabilities.booking.description"),
      actionLabel: t("landing.capabilities.booking.action"),
      href: "#landing-roadmap"
    },
    {
      id: "erp",
      number: "04",
      icon: OfficeBuilding,
      status: "planned",
      statusLabel: t("landing.status.planned"),
      title: t("landing.capabilities.erp.title"),
      description: t("landing.capabilities.erp.description"),
      actionLabel: t("landing.capabilities.erp.action"),
      href: "#landing-roadmap"
    }
  ];
});

function stopAutoplay() {
  if (autoplayTimer) window.clearInterval(autoplayTimer);
  autoplayTimer = 0;
}

function startAutoplay() {
  stopAutoplay();
  if (reducedMotion.value || showIntro.value || slides.value.length < 2) return;
  autoplayTimer = window.setInterval(nextSlide, 7200);
}

function goToSlide(index: number) {
  activeSlideIndex.value = index;
  startAutoplay();
}

function nextSlide() {
  activeSlideIndex.value = (activeSlideIndex.value + 1) % slides.value.length;
}

function previousSlide() {
  activeSlideIndex.value = (activeSlideIndex.value - 1 + slides.value.length) % slides.value.length;
  startAutoplay();
}

function finishIntro() {
  if (!showIntro.value) return;
  showIntro.value = false;
  window.clearTimeout(introTimer);
  document.body.style.overflow = previousBodyOverflow;
  try {
    sessionStorage.setItem(INTRO_STORAGE_KEY, "1");
  } catch {
    // The intro remains functional when browser storage is unavailable.
  }
  startAutoplay();
}

function updateDocumentTitle() {
  currentLocale.value;
  document.title = t("landing.metaTitle");
}

onMounted(() => {
  reducedMotion.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const alreadySeen = introWasSeen();
  showIntro.value = !alreadySeen;
  if (showIntro.value) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    introTimer = window.setTimeout(finishIntro, reducedMotion.value ? 480 : 2100);
  } else {
    startAutoplay();
  }
  updateDocumentTitle();
});

watch(currentLocale, updateDocumentTitle);

onUnmounted(() => {
  window.clearTimeout(introTimer);
  stopAutoplay();
  document.body.style.overflow = previousBodyOverflow;
  document.title = t("app.name");
});
</script>

<style scoped>
.landing-page {
  --landing-ink: #071829;
  --landing-navy: #0a2740;
  --landing-blue: #0b68d2;
  --landing-blue-bright: #1e8cff;
  --landing-cyan: #68d9ff;
  --landing-line: rgba(11, 50, 82, 0.14);
  min-height: 100vh;
  overflow-x: clip;
  color: var(--landing-ink);
  background: #f7f9fc;
  scroll-behavior: smooth;
}

.landing-page a {
  color: inherit;
  text-decoration: none;
}

.landing-intro {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: #fff;
  background:
    radial-gradient(circle at 50% 42%, rgba(31, 135, 241, 0.2), transparent 30%),
    linear-gradient(145deg, #04111f 0%, #071f35 48%, #061725 100%);
}

.landing-intro::before,
.landing-intro::after {
  content: "";
  position: absolute;
  pointer-events: none;
}

.landing-intro::before {
  inset: 0;
  opacity: 0.18;
  background-image:
    linear-gradient(rgba(116, 196, 255, 0.24) 1px, transparent 1px),
    linear-gradient(90deg, rgba(116, 196, 255, 0.24) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent);
}

.landing-intro::after {
  width: min(68vw, 900px);
  height: 1px;
  top: 50%;
  left: 50%;
  background: linear-gradient(90deg, transparent, rgba(104, 217, 255, 0.45), transparent);
  transform: translate(-50%, 92px);
}

.landing-intro__glow {
  position: absolute;
  width: 34vw;
  aspect-ratio: 1;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.16;
  background: #168cff;
}

.landing-intro__glow--one { top: -18vw; right: -12vw; }
.landing-intro__glow--two { bottom: -20vw; left: -12vw; background: #17d9d2; }

.landing-intro__content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: min(76vw, 360px);
}

.landing-intro__book {
  position: relative;
  width: 90px;
  height: 70px;
  margin-bottom: 30px;
  perspective: 720px;
  transform: rotate(-3deg);
}

.landing-intro__back,
.landing-intro__page,
.landing-intro__cover {
  position: absolute;
  inset: 0;
  border-radius: 3px 9px 9px 3px;
  transform-origin: left center;
}

.landing-intro__back {
  background: #0a76db;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.38);
}

.landing-intro__page {
  left: 4px;
  top: 4px;
  right: 3px;
  bottom: 4px;
  background: linear-gradient(90deg, #dceeff, #fff 45%, #cfe6f8);
  box-shadow: inset 6px 0 12px rgba(13, 48, 76, 0.15);
  animation: landing-flip-page 1.35s cubic-bezier(0.7, 0, 0.25, 1) infinite;
}

.landing-intro__page--two { animation-delay: 0.18s; }
.landing-intro__page--three { animation-delay: 0.36s; }

.landing-intro__cover {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: linear-gradient(145deg, #1689f5, #0753af);
  box-shadow: inset 1px 0 rgba(255, 255, 255, 0.3);
  animation: landing-open-cover 2.1s cubic-bezier(0.7, 0, 0.2, 1) both;
}

.landing-intro__cover i,
.landing-brand__mark i {
  display: block;
  width: 10px;
  height: 22px;
  border: 2px solid currentColor;
  border-radius: 2px;
  transform: skewY(-24deg);
}

.landing-intro__cover i:nth-child(2),
.landing-brand__mark i:nth-child(2) { transform: translateY(-4px) skewY(24deg); }
.landing-intro__cover i:nth-child(3),
.landing-brand__mark i:nth-child(3) { transform: skewY(-24deg); }

.landing-intro__wordmark {
  display: flex;
  flex-direction: column;
  align-items: center;
  letter-spacing: 0.24em;
}

.landing-intro__wordmark span {
  font-size: clamp(32px, 5vw, 52px);
  font-weight: 800;
  line-height: 1;
}

.landing-intro__wordmark small {
  margin-top: 11px;
  color: rgba(255, 255, 255, 0.56);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3em;
}

.landing-intro__content > p {
  margin: 28px 0 14px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  letter-spacing: 0.08em;
}

.landing-intro__progress {
  width: min(72vw, 320px);
  height: 2px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
}

.landing-intro__progress i {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #26c7ff, #fff);
  transform-origin: left;
  animation: landing-intro-progress 2.05s ease both;
}

button.landing-intro__skip {
  position: absolute;
  right: 28px;
  bottom: 24px;
  min-height: auto;
  padding: 8px 12px;
  border: 0;
  border-radius: 0;
  color: rgba(255, 255, 255, 0.56);
  background: none;
  box-shadow: none;
  font-size: 12px;
  letter-spacing: 0.12em;
}

button.landing-intro__skip:hover {
  color: #fff;
  border: 0;
  background: none;
  box-shadow: none;
}

.landing-intro-enter-active,
.landing-intro-leave-active { transition: opacity 0.55s ease, filter 0.55s ease; }
.landing-intro-enter-from,
.landing-intro-leave-to { opacity: 0; filter: blur(8px); }

.landing-header {
  position: sticky;
  top: 0;
  z-index: 80;
  min-height: 84px;
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) auto minmax(280px, 0.8fr);
  align-items: center;
  gap: 28px;
  padding: 0 clamp(24px, 4vw, 72px);
  border-bottom: 1px solid rgba(7, 24, 41, 0.09);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 12px 30px rgba(7, 24, 41, 0.08);
  backdrop-filter: blur(18px);
}

.landing-brand {
  display: inline-flex;
  align-items: center;
  gap: 13px;
  width: fit-content;
}

.landing-brand__mark {
  display: flex;
  align-items: center;
  gap: 2px;
  color: #0873d8;
}

.landing-brand__mark i {
  width: 8px;
  height: 20px;
  border-width: 2px;
}

.landing-brand__copy {
  display: flex;
  flex-direction: column;
}

.landing-brand__copy strong {
  color: #071829;
  font-size: 23px;
  line-height: 1;
  letter-spacing: 0.12em;
}

.landing-brand__copy small {
  margin-top: 5px;
  color: #658096;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.landing-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(18px, 2.2vw, 38px);
  white-space: nowrap;
}

.landing-nav a {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 31px 0 28px;
  color: #233e56;
  font-size: 14px;
  font-weight: 650;
}

.landing-nav a::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 3px;
  background: #0b73d7;
  transform: scaleX(0);
  transition: transform 0.2s ease;
}

.landing-nav a:hover::after,
.landing-nav a:focus-visible::after { transform: scaleX(1); }

.landing-nav__tracking span {
  padding: 3px 6px;
  border-radius: 999px;
  color: #08765e;
  background: #e3f8f0;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.landing-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.landing-language {
  box-shadow: none;
}

.landing-entry-button {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 19px;
  border: 1px solid #0b68d2;
  border-radius: 999px;
  color: #095eb8;
  font-size: 13px;
  font-weight: 750;
  transition: color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.landing-entry-button:hover {
  color: #fff;
  background: #0b68d2;
  transform: translateY(-1px);
}

.landing-hero {
  position: relative;
  min-height: 680px;
  overflow: hidden;
  color: #fff;
  background: #071829;
  perspective: 1800px;
}

.landing-hero__slide {
  position: absolute;
  inset: 0;
  background-position: center;
  background-size: cover;
  will-change: transform, opacity;
}

.landing-hero__wash {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(2, 17, 31, 0.92) 0%, rgba(4, 28, 49, 0.76) 46%, rgba(6, 35, 58, 0.24) 78%, rgba(3, 15, 27, 0.18) 100%),
    linear-gradient(0deg, rgba(3, 18, 31, 0.46), transparent 56%);
}

.landing-hero__angle {
  position: absolute;
  pointer-events: none;
}

.landing-hero__angle--left {
  inset: 0 37% 0 -10%;
  opacity: 0.5;
  background: #061a2d;
  clip-path: polygon(0 0, 100% 0, 72% 100%, 0 100%);
}

.landing-hero__angle--right {
  top: 0;
  right: -10%;
  bottom: 0;
  width: 44%;
  opacity: 0.13;
  background: #8bcfff;
  clip-path: polygon(42% 0, 100% 0, 100% 100%, 0 100%);
}

.landing-hero__grid {
  position: absolute;
  inset: 0;
  opacity: 0.14;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.14) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
  background-size: 76px 76px;
  mask-image: linear-gradient(90deg, #000, transparent 68%);
}

.landing-hero__inner {
  position: relative;
  z-index: 2;
  width: min(1400px, calc(100% - 96px));
  min-height: 680px;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(330px, 0.52fr);
  align-items: center;
  gap: 9vw;
  margin: 0 auto;
  padding: 64px 0 108px;
}

.landing-hero__content { max-width: 820px; }

.landing-kicker {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 26px;
  color: #b9ddf7;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.landing-kicker span {
  width: 34px;
  height: 2px;
  background: #36b7ff;
}

.landing-hero h1 {
  max-width: 780px;
  margin: 0;
  color: #fff;
  font-size: clamp(44px, 5.6vw, 82px);
  font-weight: 720;
  letter-spacing: -0.045em;
  line-height: 1.06;
  text-wrap: balance;
}

.landing-hero__description {
  max-width: 680px;
  margin: 28px 0 0;
  color: rgba(232, 244, 255, 0.8);
  font-size: clamp(16px, 1.35vw, 20px);
  line-height: 1.78;
}

.landing-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 38px;
}

.landing-button {
  min-height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 25px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 760;
  transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.landing-button:hover { transform: translateY(-2px); }

.landing-button--primary {
  border: 1px solid #1689f5;
  color: #fff;
  background: #0b73d7;
  box-shadow: 0 14px 34px rgba(0, 102, 204, 0.34);
}

.landing-button--primary:hover { background: #1587f0; }

.landing-button--ghost {
  border: 1px solid rgba(255, 255, 255, 0.48);
  color: #fff;
  background: rgba(8, 29, 48, 0.2);
  backdrop-filter: blur(10px);
}

.landing-button--ghost:hover { border-color: #fff; background: rgba(255, 255, 255, 0.1); }

.landing-hero__signal {
  align-self: end;
  margin-bottom: 142px;
  padding: 19px 20px;
  border: 1px solid rgba(183, 225, 255, 0.22);
  border-radius: 14px;
  background: rgba(5, 24, 41, 0.64);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(18px);
}

.landing-hero__signal-head,
.landing-hero__signal-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: rgba(226, 243, 255, 0.62);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.landing-hero__signal-head i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #39dcaa;
  box-shadow: 0 0 0 5px rgba(57, 220, 170, 0.12);
}

.landing-hero__route {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  margin: 22px 0 18px;
}

.landing-hero__route > span {
  display: grid;
  place-items: center;
  width: 43px;
  height: 43px;
  border-radius: 11px;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
  font-weight: 800;
}

.landing-hero__route > div {
  display: grid;
  grid-template-columns: 7px 1fr 7px;
  align-items: center;
}

.landing-hero__route > div::before {
  content: "";
  grid-column: 1 / -1;
  grid-row: 1;
  height: 1px;
  background: linear-gradient(90deg, #36b7ff, rgba(255, 255, 255, 0.3));
}

.landing-hero__route i,
.landing-hero__route b {
  z-index: 1;
  grid-row: 1;
  width: 7px;
  height: 7px;
  border: 2px solid #87d8ff;
  border-radius: 50%;
  background: #073151;
}

.landing-hero__route b {
  justify-self: center;
  width: 11px;
  height: 11px;
  border-color: #fff;
  box-shadow: 0 0 0 5px rgba(59, 184, 255, 0.16);
}

.landing-hero__signal-foot strong { color: #fff; font-size: 11px; }

.landing-hero__footer {
  position: absolute;
  z-index: 5;
  right: clamp(30px, 5vw, 88px);
  bottom: 92px;
  left: clamp(30px, 5vw, 88px);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.landing-hero__pagination {
  display: flex;
  align-items: center;
  gap: 18px;
}

.landing-hero__pagination button,
.landing-hero__arrows button {
  min-height: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
  color: rgba(255, 255, 255, 0.46);
  background: none;
  box-shadow: none;
}

.landing-hero__pagination button {
  display: grid;
  grid-template-columns: auto 44px;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  font-weight: 800;
}

.landing-hero__pagination button i {
  width: 44px;
  height: 2px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.2);
}

.landing-hero__pagination button i::after {
  content: "";
  display: block;
  width: 100%;
  height: 100%;
  background: #4cc4ff;
  transform: scaleX(0);
  transform-origin: left;
}

.landing-hero__pagination button.active { color: #fff; }
.landing-hero__pagination button.active i::after { animation: landing-slide-progress 7.2s linear both; }

.landing-hero__arrows { display: flex; gap: 2px; }

.landing-hero__arrows button {
  width: 48px;
  height: 46px;
  display: grid;
  place-items: center;
  color: #163d5d;
  background: rgba(255, 255, 255, 0.9);
  transition: color 0.2s ease, background 0.2s ease;
}

.landing-hero__arrows button:hover {
  border: 0;
  color: #fff;
  background: #0b73d7;
  box-shadow: none;
}

.landing-hero-page-enter-active,
.landing-hero-page-leave-active {
  transition: transform 0.72s cubic-bezier(0.7, 0, 0.2, 1), opacity 0.6s ease, filter 0.6s ease;
  transform-style: preserve-3d;
  backface-visibility: hidden;
}

.landing-hero-page-enter-from {
  opacity: 0;
  filter: brightness(0.55);
  transform: rotateY(-10deg) scale(1.035);
  transform-origin: left center;
}

.landing-hero-page-leave-to {
  opacity: 0;
  filter: brightness(0.55);
  transform: rotateY(10deg) scale(1.015);
  transform-origin: right center;
}

.landing-capabilities {
  position: relative;
  z-index: 8;
  width: min(1260px, calc(100% - 64px));
  margin: -66px auto 0;
}

.landing-capabilities__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.landing-capability-card {
  position: relative;
  min-height: 270px;
  display: flex;
  flex-direction: column;
  padding: 30px 27px 26px;
  overflow: hidden;
  border: 1px solid #dce6ef;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(8, 36, 59, 0.1);
  transition: color 0.25s ease, background 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
}

.landing-capability-card::after {
  content: "";
  position: absolute;
  right: -44px;
  bottom: -54px;
  width: 140px;
  height: 140px;
  border: 1px solid rgba(21, 112, 205, 0.14);
  border-radius: 50%;
  box-shadow: 0 0 0 22px rgba(21, 112, 205, 0.04);
}

.landing-capability-card:hover {
  color: #fff;
  background: #0b68c7;
  transform: translateY(-8px);
  box-shadow: 0 25px 58px rgba(7, 73, 139, 0.28);
}

.landing-capability-card.is-public { border-color: #8bcdb7; }
.landing-capability-card.is-public::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: linear-gradient(90deg, #20bc88, #27a6eb);
}

.landing-capability-card__number {
  position: absolute;
  top: 22px;
  right: 23px;
  color: #a9b9c7;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.landing-capability-card__icon {
  width: 50px;
  height: 50px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: #0b6fd2;
  background: #eaf4ff;
  font-size: 24px;
}

.landing-capability-card__status {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 20px;
  color: #71879a;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.landing-capability-card__status i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #42c893;
  box-shadow: 0 0 0 4px rgba(66, 200, 147, 0.12);
}

.landing-capability-card--booking .landing-capability-card__status i,
.landing-capability-card--erp .landing-capability-card__status i {
  background: #aab8c4;
  box-shadow: none;
}

.landing-capability-card h2 {
  margin: 13px 0 8px;
  color: #10283e;
  font-size: 20px;
  letter-spacing: -0.02em;
}

.landing-capability-card p {
  margin: 0;
  color: #63788b;
  font-size: 13px;
  line-height: 1.65;
}

.landing-capability-card__link {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: auto;
  padding-top: 14px;
  color: #0b68c7;
  font-size: 12px;
  font-weight: 800;
}

.landing-capability-card:hover h2,
.landing-capability-card:hover p,
.landing-capability-card:hover .landing-capability-card__status,
.landing-capability-card:hover .landing-capability-card__link,
.landing-capability-card:hover .landing-capability-card__number { color: #fff; }

.landing-capability-card:hover .landing-capability-card__icon {
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
}

.landing-statement {
  padding: 120px max(32px, calc((100vw - 1260px) / 2)) 100px;
  text-align: center;
  background: #f7f9fc;
}

.landing-section-heading > p {
  margin: 0 0 16px;
  color: #0b6fd2;
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.landing-section-heading h2 {
  max-width: 760px;
  margin: 0;
  color: #0b2134;
  font-size: clamp(34px, 4vw, 56px);
  letter-spacing: -0.04em;
  line-height: 1.12;
  text-wrap: balance;
}

.landing-section-heading > span {
  display: block;
  max-width: 760px;
  margin-top: 22px;
  color: #60768a;
  font-size: 16px;
  line-height: 1.8;
}

.landing-section-heading--center {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.landing-statement__actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 42px;
}

.landing-pill {
  width: min(340px, 42vw);
  min-height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 11px;
  border-radius: 999px;
  color: #fff !important;
  font-size: 15px;
  font-weight: 760;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.landing-pill:hover { transform: translateY(-2px); box-shadow: 0 15px 32px rgba(10, 55, 91, 0.18); }
.landing-pill--dark { background: #0b2134; }
.landing-pill--blue { background: #1474d2; }

.landing-statement__metrics {
  max-width: 900px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 72px auto 0;
  border-top: 1px solid var(--landing-line);
  border-bottom: 1px solid var(--landing-line);
}

.landing-statement__metrics div {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
  padding: 25px 16px;
}

.landing-statement__metrics div + div { border-left: 1px solid var(--landing-line); }
.landing-statement__metrics strong { color: #0b6fd2; font-size: 28px; }
.landing-statement__metrics span { color: #526b80; font-size: 13px; font-weight: 700; }

.landing-roadmap {
  min-height: 690px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  background: #fff;
}

.landing-roadmap__visual {
  position: relative;
  min-height: 690px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    linear-gradient(rgba(65, 153, 224, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(65, 153, 224, 0.08) 1px, transparent 1px),
    radial-gradient(circle at 40% 36%, #dff4ff, #edf5fb 48%, #e6edf4 100%);
  background-size: 54px 54px, 54px 54px, auto;
}

.landing-roadmap__orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(3px);
}

.landing-roadmap__orb--one {
  width: 360px;
  height: 360px;
  top: -130px;
  right: -80px;
  border: 70px solid rgba(19, 122, 210, 0.08);
}

.landing-roadmap__orb--two {
  width: 240px;
  height: 240px;
  bottom: -110px;
  left: -50px;
  background: rgba(16, 151, 139, 0.1);
}

.landing-roadmap__console {
  position: relative;
  width: min(78%, 560px);
  padding: 25px;
  border: 1px solid rgba(13, 91, 151, 0.16);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 34px 80px rgba(20, 70, 107, 0.18);
  backdrop-filter: blur(18px);
  transform: rotate(-2deg);
}

.landing-roadmap__console::before {
  content: "";
  position: absolute;
  inset: 11px -15px -17px 14px;
  z-index: -1;
  border-radius: 18px;
  background: #0b68c7;
  opacity: 0.14;
}

.landing-roadmap__console-head,
.landing-roadmap__console-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #6c8496;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.11em;
}

.landing-roadmap__console-head i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #27c68d;
  box-shadow: 0 0 0 5px rgba(39, 198, 141, 0.12);
}

.landing-roadmap__route-line {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr auto 1fr auto;
  align-items: center;
  gap: 7px;
  margin: 32px 0 24px;
}

.landing-roadmap__route-line span {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: #0c6dca;
  font-size: 9px;
  font-weight: 850;
}

.landing-roadmap__route-line span:nth-of-type(n+3) { color: #8496a5; background: #e9eef3; }
.landing-roadmap__route-line i { height: 2px; background: linear-gradient(90deg, #0c6dca, #cfdbe5); }

.landing-roadmap__modules {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 9px;
}

.landing-roadmap__modules div {
  min-height: 82px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid #dee7ee;
  border-radius: 10px;
  color: #91a0ac;
  background: #f6f8fa;
  font-size: 9px;
  font-weight: 850;
}

.landing-roadmap__modules .el-icon { font-size: 23px; }
.landing-roadmap__modules .is-live { color: #0b68c7; border-color: #b7d9f8; background: #eaf5ff; }
.landing-roadmap__modules .is-public { color: #087c60; border-color: #a6dbc9; background: #eaf9f4; }
.landing-roadmap__console-foot { margin-top: 26px; }
.landing-roadmap__console-foot strong { color: #0b68c7; font-size: 14px; }

.landing-roadmap__content {
  align-self: center;
  max-width: 650px;
  padding: 80px clamp(44px, 7vw, 120px);
}

.landing-roadmap__stages {
  display: grid;
  gap: 12px;
  margin-top: 36px;
}

.landing-roadmap__stages > div {
  position: relative;
  padding: 20px 22px 20px 53px;
  border-left: 2px solid #d8e2eb;
  background: #f7f9fb;
}

.landing-roadmap__stages > div::before {
  content: "";
  position: absolute;
  left: 20px;
  top: 27px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #a9b9c6;
}

.landing-roadmap__stages > div.is-current { border-left-color: #0b73d7; background: #eef7ff; }
.landing-roadmap__stages > div.is-current::before { background: #0b73d7; box-shadow: 0 0 0 6px rgba(11, 115, 215, 0.12); }

.landing-roadmap__stages span {
  display: block;
  margin-bottom: 4px;
  color: #698094;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.landing-roadmap__stages strong { color: #10283e; font-size: 16px; }
.landing-roadmap__stages p { margin: 6px 0 0; color: #63798c; font-size: 13px; line-height: 1.6; }

.landing-text-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 30px;
  color: #0b68c7 !important;
  font-size: 13px;
  font-weight: 850;
}

.landing-cta {
  position: relative;
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 48px;
  padding: 64px max(48px, calc((100vw - 1260px) / 2));
  overflow: hidden;
  color: #fff;
  background:
    radial-gradient(circle at 85% 10%, rgba(61, 185, 255, 0.28), transparent 26%),
    linear-gradient(120deg, #071d31, #0a4c82);
}

.landing-cta::after {
  content: "";
  position: absolute;
  width: 440px;
  height: 440px;
  right: -130px;
  bottom: -300px;
  border: 70px solid rgba(255, 255, 255, 0.06);
  border-radius: 50%;
}

.landing-cta > div { position: relative; z-index: 1; }
.landing-cta p { margin: 0 0 13px; color: #77c8ff; font-size: 11px; font-weight: 850; letter-spacing: 0.18em; }
.landing-cta h2 { max-width: 740px; margin: 0; font-size: clamp(30px, 3.4vw, 48px); letter-spacing: -0.035em; line-height: 1.12; }
.landing-cta > div > span { display: block; max-width: 720px; margin-top: 18px; color: rgba(228, 242, 253, 0.72); font-size: 15px; }
.landing-cta__actions { display: flex; gap: 12px; flex: 0 0 auto; }
.landing-button--light { color: #0b4f84 !important; background: #fff; }
.landing-button--outline { border: 1px solid rgba(255, 255, 255, 0.55); color: #fff !important; }

.landing-footer {
  display: grid;
  grid-template-columns: 1.2fr auto 1fr;
  align-items: center;
  gap: 42px;
  padding: 44px max(32px, calc((100vw - 1260px) / 2));
  color: #93a8b9;
  background: #06131f;
}

.landing-footer__brand { display: flex; align-items: center; gap: 15px; }
.landing-footer__brand .landing-brand__mark { color: #59baff; }
.landing-footer__brand strong { color: #fff; font-size: 18px; letter-spacing: 0.1em; }
.landing-footer__brand p { margin: 4px 0 0; font-size: 11px; }
.landing-footer__links { display: flex; gap: 22px; font-size: 11px; font-weight: 750; }
.landing-footer__links a:hover { color: #fff; }
.landing-footer__meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; font-size: 10px; }

@keyframes landing-flip-page {
  0% { opacity: 0; transform: rotateY(0); }
  10% { opacity: 1; }
  65%, 100% { opacity: 0; transform: rotateY(-176deg); }
}

@keyframes landing-open-cover {
  0%, 18% { transform: rotateY(0); }
  72%, 100% { transform: rotateY(-158deg); }
}

@keyframes landing-intro-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

@keyframes landing-slide-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

@media (max-width: 1180px) {
  .landing-header { grid-template-columns: minmax(200px, 1fr) auto; }
  .landing-nav { display: none; }
  .landing-hero__inner { width: min(100% - 64px, 1100px); grid-template-columns: 1fr minmax(280px, 0.45fr); gap: 5vw; }
  .landing-capabilities__grid { grid-template-columns: repeat(2, 1fr); }
  .landing-capability-card { min-height: 238px; }
  .landing-roadmap__content { padding-right: 48px; padding-left: 48px; }
  .landing-cta { align-items: flex-start; flex-direction: column; }
  .landing-footer { grid-template-columns: 1fr auto; }
  .landing-footer__meta { grid-column: 1 / -1; flex-direction: row; justify-content: space-between; align-items: center; }
}

@media (max-width: 760px) {
  .landing-header {
    min-height: 70px;
    grid-template-columns: 1fr auto;
    gap: 12px;
    padding: 0 16px;
  }

  .landing-brand__copy small { display: none; }
  .landing-brand__copy strong { font-size: 19px; }
  .landing-header__actions { gap: 6px; }
  .landing-language { transform: scale(0.9); transform-origin: right center; }
  .landing-entry-button { width: 40px; min-height: 38px; padding: 0; }
  .landing-entry-button span {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .landing-hero { min-height: 650px; }
  .landing-hero__inner {
    width: calc(100% - 36px);
    min-height: 650px;
    grid-template-columns: 1fr;
    align-content: center;
    padding: 54px 0 128px;
  }

  .landing-hero h1 { font-size: clamp(39px, 12vw, 58px); }
  .landing-hero__description { font-size: 15px; line-height: 1.65; }
  .landing-hero__signal { display: none; }
  .landing-hero__angle--left { right: 4%; }
  .landing-hero__footer { right: 18px; bottom: 84px; left: 18px; }
  .landing-hero__pagination button { grid-template-columns: auto 28px; }
  .landing-hero__pagination button i { width: 28px; }
  .landing-hero__pagination { gap: 10px; }
  .landing-hero__arrows button { width: 42px; height: 42px; }

  .landing-capabilities { width: calc(100% - 28px); margin-top: -56px; }
  .landing-capabilities__grid { grid-template-columns: 1fr; }
  .landing-capability-card { min-height: 220px; }

  .landing-statement { padding: 90px 20px 74px; }
  .landing-section-heading h2 { font-size: 34px; }
  .landing-section-heading > span { font-size: 14px; }
  .landing-statement__actions { flex-direction: column; align-items: center; }
  .landing-pill { width: 100%; max-width: 360px; }
  .landing-statement__metrics { grid-template-columns: 1fr; margin-top: 52px; }
  .landing-statement__metrics div + div { border-top: 1px solid var(--landing-line); border-left: 0; }

  .landing-roadmap { grid-template-columns: 1fr; }
  .landing-roadmap__visual { min-height: 440px; }
  .landing-roadmap__console { width: calc(100% - 54px); }
  .landing-roadmap__content { padding: 70px 22px; }

  .landing-cta { padding: 60px 22px; }
  .landing-cta__actions { width: 100%; flex-direction: column; }
  .landing-cta__actions .landing-button { width: 100%; }

  .landing-footer { grid-template-columns: 1fr; padding: 42px 22px; }
  .landing-footer__links { flex-wrap: wrap; }
  .landing-footer__meta { grid-column: auto; flex-direction: column; align-items: flex-start; }
}

@media (prefers-reduced-motion: reduce) {
  .landing-page { scroll-behavior: auto; }
  .landing-intro__page,
  .landing-intro__cover,
  .landing-intro__progress i,
  .landing-hero__pagination button.active i::after { animation: none; }
  .landing-hero-page-enter-active,
  .landing-hero-page-leave-active { transition-duration: 0.01ms; }
  .landing-capability-card,
  .landing-button,
  .landing-entry-button { transition: none; }
}
</style>
