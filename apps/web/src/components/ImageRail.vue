<script setup lang="ts">
import { RouterLink } from 'vue-router'

import { resolveAssetUrl } from '@/services/api'
import type { ImageSummary } from '@/types/api'

defineProps<{
  images: ImageSummary[]
  currentId: string
  loading?: boolean
}>()
</script>

<template>
  <aside class="image-rail" aria-label="图片库快捷切换">
    <div class="rail-heading">
      <span>图片库</span>
      <RouterLink to="/" class="rail-link">全部</RouterLink>
    </div>

    <div v-if="loading" class="rail-skeletons">
      <span v-for="index in 3" :key="index" class="rail-skeleton"></span>
    </div>

    <nav v-else class="rail-list">
      <RouterLink
        v-for="image in images"
        :key="image.id"
        :to="`/images/${image.id}`"
        class="rail-item"
        :class="{ 'is-active': image.id === currentId }"
      >
        <span class="rail-thumb">
          <img :src="resolveAssetUrl(image.imageUrl)" alt="" />
        </span>
        <span class="rail-copy">
          <strong>{{ image.title }}</strong>
          <small>{{ image.annotationCount }} 个标记</small>
        </span>
      </RouterLink>
    </nav>

    <RouterLink to="/" class="rail-upload">＋ 上传新图片</RouterLink>
  </aside>
</template>

<style scoped>
.image-rail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 16px 12px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.rail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px 13px;
  color: var(--text-soft);
  font-size: 11px;
  font-weight: 750;
}

.rail-link {
  color: var(--muted);
  font-size: 9px;
  font-weight: 550;
  text-decoration: none;
}

.rail-link:hover {
  color: var(--accent);
}

.rail-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  overflow-y: auto;
}

.rail-item {
  display: flex;
  gap: 9px;
  padding: 7px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--text);
  text-decoration: none;
  transition:
    background 140ms ease,
    border-color 140ms ease;
}

.rail-item:hover {
  background: var(--surface-muted);
}

.rail-item.is-active {
  border-color: color-mix(in srgb, var(--accent) 22%, var(--border));
  background: var(--accent-soft);
}

.rail-thumb {
  display: block;
  width: 46px;
  height: 46px;
  flex: none;
  overflow: hidden;
  border-radius: 7px;
  background: var(--surface-muted);
}

.rail-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rail-copy {
  display: flex;
  min-width: 0;
  justify-content: center;
  flex-direction: column;
}

.rail-copy strong {
  overflow: hidden;
  font-size: 10px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-copy small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 8px;
}

.rail-upload {
  margin-top: 12px;
  padding: 10px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  text-decoration: none;
}

.rail-upload:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.rail-skeletons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rail-skeleton {
  height: 60px;
  border-radius: 10px;
  background: linear-gradient(
    90deg,
    var(--surface-muted),
    #f8f9f6,
    var(--surface-muted)
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
