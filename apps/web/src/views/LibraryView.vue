<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import UploadDialog from '@/components/UploadDialog.vue'
import { formatDateTime, formatDimensions } from '@/lib/format'
import { ApiRequestError, listImages, resolveAssetUrl } from '@/services/api'
import type { ImageSummary } from '@/types/api'

const router = useRouter()
const images = ref<ImageSummary[]>([])
const total = ref(0)
const loading = ref(true)
const errorMessage = ref('')
const search = ref('')
const uploadOpen = ref(false)
let searchTimer: number | undefined
let requestSequence = 0

async function loadImages(): Promise<void> {
  const sequence = ++requestSequence
  loading.value = true
  errorMessage.value = ''

  try {
    const response = await listImages(search.value)
    if (sequence !== requestSequence) return
    images.value = response.items
    total.value = response.total
  } catch (error) {
    if (sequence !== requestSequence) return
    errorMessage.value =
      error instanceof ApiRequestError
        ? error.message
        : '图片库加载失败，请确认后端已经启动'
  } finally {
    if (sequence === requestSequence) {
      loading.value = false
    }
  }
}

watch(search, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    void loadImages()
  }, 260)
})

function handleUploaded(image: ImageSummary): void {
  uploadOpen.value = false
  void router.push(`/images/${image.id}`)
}

onMounted(() => {
  void loadImages()
})

onBeforeUnmount(() => {
  window.clearTimeout(searchTimer)
})
</script>

<template>
  <main class="library-page">
    <section class="library-hero">
      <div class="hero-orbit orbit-one"></div>
      <div class="hero-orbit orbit-two"></div>
      <div class="hero-content">
        <span class="hero-kicker">VISUAL REVIEW WORKSPACE</span>
        <h1>把问题，<em>钉在图上。</em></h1>
        <p>
          海报和商详图的问题不要只留在聊天记录里。点击图片落下标记，
          写一句说明，同事下次打开还能准确找到同一块区域。
        </p>
        <div class="hero-actions">
          <button
            class="button button-accent button-large"
            type="button"
            @click="uploadOpen = true"
          >
            <span class="button-plus">+</span>
            上传一张图片
          </button>
          <span class="hero-footnote">
            <i></i>
            本地 SQLite · 无需账号密码
          </span>
        </div>
      </div>

      <div class="hero-demo" aria-hidden="true">
        <div class="demo-sheet">
          <span class="demo-label">NEW SEASON</span>
          <span class="demo-circle"></span>
          <span class="demo-line line-one"></span>
          <span class="demo-line line-two"></span>
          <span class="demo-pin pin-one">1</span>
          <span class="demo-pin pin-two">2</span>
        </div>
      </div>
    </section>

    <section class="library-section">
      <header class="library-toolbar">
        <div>
          <span class="section-kicker">REFERENCE LIBRARY</span>
          <h2>审图素材</h2>
          <p v-if="!loading">
            {{ search ? `找到 ${total} 张相关图片` : `共 ${total} 张图片` }}
          </p>
        </div>

        <label class="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            v-model="search"
            type="search"
            placeholder="搜索图片标题"
            aria-label="搜索图片标题"
          />
        </label>
      </header>

      <div v-if="loading" class="image-grid">
        <span
          v-for="index in 4"
          :key="index"
          class="image-skeleton"
        ></span>
      </div>

      <div v-else-if="errorMessage" class="library-error">
        <strong>图片库暂时打不开</strong>
        <p>{{ errorMessage }}</p>
        <button class="button button-primary" type="button" @click="loadImages">
          重新加载
        </button>
      </div>

      <div v-else-if="!images.length" class="library-empty">
        <span class="empty-mark">+</span>
        <h3>{{ search ? '没有匹配的图片' : '还没有图片' }}</h3>
        <p>
          {{
            search
              ? '换一个关键词试试，或清空搜索。'
              : '上传第一张海报或商品详情图，然后开始标注。'
          }}
        </p>
        <button
          v-if="!search"
          class="button button-primary"
          type="button"
          @click="uploadOpen = true"
        >
          上传第一张图片
        </button>
      </div>

      <div v-else class="image-grid">
        <RouterLink
          v-for="image in images"
          :key="image.id"
          :to="`/images/${image.id}`"
          class="image-card"
        >
          <span class="image-card-preview">
            <img
              :src="resolveAssetUrl(image.imageUrl)"
              :alt="image.title"
              loading="lazy"
            />
            <span class="card-count">
              {{ image.annotationCount }}
              <small>标记</small>
            </span>
            <span class="card-open">打开审图 →</span>
          </span>
          <span class="image-card-body">
            <strong>{{ image.title }}</strong>
            <span class="card-meta">
              <span>{{ formatDimensions(image.width, image.height) }}</span>
              <span>
                {{
                  image.lastAnnotatedAt
                    ? `最近 ${formatDateTime(image.lastAnnotatedAt)}`
                    : '尚未标注'
                }}
              </span>
            </span>
          </span>
        </RouterLink>

        <button
          type="button"
          class="add-image-card"
          @click="uploadOpen = true"
        >
          <span class="add-image-symbol">+</span>
          <strong>添加新素材</strong>
          <small>JPG / PNG / WebP</small>
        </button>
      </div>
    </section>

    <UploadDialog
      :open="uploadOpen"
      @close="uploadOpen = false"
      @uploaded="handleUploaded"
    />
  </main>
</template>

<style scoped>
.library-page {
  width: min(1280px, 100%);
  margin: 0 auto;
  padding: 26px 24px 54px;
}

.library-hero {
  position: relative;
  display: flex;
  min-height: 300px;
  overflow: hidden;
  padding: 46px 52px;
  border-radius: 24px;
  background:
    radial-gradient(circle at 76% 15%, rgb(246 200 95 / 17%), transparent 28%),
    linear-gradient(128deg, #172238 0%, #1d3040 62%, #24473f 100%);
  box-shadow: 0 24px 60px rgb(23 34 56 / 18%);
  color: white;
}

.library-hero::after {
  position: absolute;
  right: -50px;
  bottom: -70px;
  width: 320px;
  height: 320px;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 50%;
  content: '';
}

.hero-orbit {
  position: absolute;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 50%;
  pointer-events: none;
}

.orbit-one {
  top: -120px;
  right: 120px;
  width: 380px;
  height: 380px;
}

.orbit-two {
  top: 60px;
  right: 270px;
  width: 190px;
  height: 190px;
}

.hero-content {
  position: relative;
  z-index: 2;
  width: min(620px, 62%);
}

.hero-kicker,
.section-kicker {
  color: #f6c85f;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.hero-content h1 {
  margin: 18px 0 0;
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: clamp(40px, 5vw, 64px);
  font-weight: 700;
  letter-spacing: -0.055em;
  line-height: 1.08;
}

.hero-content h1 em {
  color: #f6c85f;
  font-style: normal;
}

.hero-content p {
  max-width: 560px;
  margin: 20px 0 0;
  color: rgb(236 242 245 / 72%);
  font-size: 13px;
  line-height: 1.85;
}

.hero-actions {
  display: flex;
  margin-top: 28px;
  align-items: center;
  gap: 18px;
}

.button-plus {
  margin-right: 6px;
  font-size: 17px;
  font-weight: 400;
}

.hero-footnote {
  display: flex;
  align-items: center;
  gap: 7px;
  color: rgb(236 242 245 / 52%);
  font-size: 9px;
}

.hero-footnote i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4ade80;
}

.hero-demo {
  position: absolute;
  z-index: 1;
  top: 50%;
  right: 6%;
  width: 300px;
  height: 216px;
  transform: translateY(-50%) rotate(3deg);
}

.demo-sheet {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 25%);
  border-radius: 10px;
  background: #f2d4b7;
  box-shadow: 0 30px 55px rgb(8 15 25 / 32%);
}

.demo-sheet::before {
  position: absolute;
  top: 0;
  right: 0;
  width: 58%;
  height: 100%;
  background: #d35c32;
  content: '';
  clip-path: polygon(38% 0, 100% 0, 100% 100%, 0 100%);
}

.demo-label {
  position: absolute;
  z-index: 2;
  top: 34px;
  left: 24px;
  color: #6e2f1e;
  font-family: Arial, sans-serif;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.demo-circle {
  position: absolute;
  z-index: 2;
  top: 72px;
  right: 42px;
  width: 100px;
  height: 100px;
  border: 2px solid rgb(255 255 255 / 45%);
  border-radius: 50%;
}

.demo-line {
  position: absolute;
  z-index: 2;
  left: 24px;
  height: 5px;
  border-radius: 3px;
  background: rgb(110 47 30 / 32%);
}

.line-one {
  top: 82px;
  width: 118px;
}

.line-two {
  top: 96px;
  width: 76px;
}

.demo-pin {
  position: absolute;
  z-index: 3;
  display: grid;
  width: 31px;
  height: 31px;
  place-items: center;
  border: 2px solid white;
  border-radius: 50%;
  box-shadow: 0 7px 16px rgb(15 23 42 / 30%);
  color: white;
  font-size: 10px;
  font-weight: 800;
}

.demo-pin::after {
  position: absolute;
  bottom: -7px;
  left: 50%;
  border-top: 9px solid var(--demo-pin-color);
  border-right: 5px solid transparent;
  border-left: 5px solid transparent;
  content: '';
  transform: translateX(-50%);
}

.pin-one {
  --demo-pin-color: #2563eb;
  top: 92px;
  left: 136px;
  background: #2563eb;
  color: white;
}

.pin-two {
  --demo-pin-color: #059669;
  top: 136px;
  right: 70px;
  background: #059669;
  color: white;
}

.library-section {
  margin-top: 38px;
}

.library-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.section-kicker {
  color: var(--accent);
}

.library-toolbar h2 {
  margin: 8px 0 0;
  font-size: 26px;
  letter-spacing: -0.035em;
}

.library-toolbar p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 10px;
}

.search-box {
  display: flex;
  width: min(300px, 42vw);
  height: 42px;
  padding: 0 14px;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  color: var(--muted);
}

.search-box span {
  font-size: 17px;
}

.search-box input {
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  flex: 1;
}

.image-grid {
  display: grid;
  margin-top: 20px;
  gap: 15px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.image-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  color: var(--text);
  text-decoration: none;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease;
}

.image-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-4px);
}

.image-card-preview {
  position: relative;
  display: block;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: #e9ebe5;
}

.image-card-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: transform 280ms ease;
}

.image-card:hover .image-card-preview img {
  transform: scale(1.025);
}

.card-count {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  padding: 6px 9px;
  align-items: baseline;
  gap: 3px;
  border: 1px solid rgb(255 255 255 / 35%);
  border-radius: 999px;
  background: rgb(15 23 42 / 68%);
  color: white;
  font-size: 11px;
  font-weight: 750;
  backdrop-filter: blur(8px);
}

.card-count small {
  font-size: 8px;
  font-weight: 500;
  opacity: 0.72;
}

.card-open {
  position: absolute;
  right: 14px;
  bottom: 14px;
  padding: 7px 10px;
  border-radius: 8px;
  background: rgb(255 255 255 / 92%);
  color: var(--text);
  font-size: 9px;
  font-weight: 700;
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.image-card:hover .card-open {
  opacity: 1;
  transform: translateY(0);
}

.image-card-body {
  display: flex;
  padding: 16px 17px 17px;
  flex-direction: column;
}

.image-card-body strong {
  overflow: hidden;
  font-size: 14px;
  letter-spacing: -0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  margin-top: 9px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted);
  font-size: 8px;
  font-variant-numeric: tabular-nums;
}

.add-image-card {
  display: flex;
  min-height: 270px;
  border: 1px dashed var(--border-strong);
  border-radius: 16px;
  background: rgb(255 255 255 / 38%);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease;
}

.add-image-card:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.add-image-symbol {
  display: grid;
  width: 42px;
  height: 42px;
  margin-bottom: 13px;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  font-size: 24px;
  font-weight: 300;
}

.add-image-card strong {
  font-size: 12px;
}

.add-image-card small {
  margin-top: 6px;
  font-size: 8px;
}

.image-skeleton {
  aspect-ratio: 4 / 3.4;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: linear-gradient(
    90deg,
    var(--surface-muted),
    #fbfcf9,
    var(--surface-muted)
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

.library-error,
.library-empty {
  display: flex;
  min-height: 280px;
  margin-top: 20px;
  padding: 36px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
}

.library-error strong,
.library-empty h3 {
  margin: 0;
  font-size: 18px;
}

.library-error p,
.library-empty p {
  max-width: 420px;
  margin: 8px 0 18px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.7;
}

.empty-mark {
  display: grid;
  width: 50px;
  height: 50px;
  margin-bottom: 14px;
  place-items: center;
  border: 1px dashed var(--border-strong);
  border-radius: 50%;
  color: var(--accent);
  font-size: 28px;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 960px) {
  .library-hero {
    padding: 38px;
  }

  .hero-content {
    width: 72%;
  }

  .hero-demo {
    right: -4%;
    opacity: 0.65;
  }

  .image-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 660px) {
  .library-page {
    padding: 14px 12px 38px;
  }

  .library-hero {
    min-height: 0;
    padding: 30px 24px;
    border-radius: 18px;
  }

  .hero-content {
    width: 100%;
  }

  .hero-content h1 {
    font-size: 38px;
  }

  .hero-demo {
    display: none;
  }

  .hero-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .library-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .search-box {
    width: 100%;
  }

  .image-grid {
    grid-template-columns: 1fr;
  }
}
</style>
