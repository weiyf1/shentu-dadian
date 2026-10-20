import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'library',
      component: () => import('@/views/LibraryView.vue'),
    },
    {
      path: '/images/:imageId',
      name: 'image',
      component: () => import('@/views/ImageView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  document.title =
    to.name === 'image' ? '审图打点 · 标记画布' : '审图打点 · 图片库'
})

export default router
