import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import type { Page } from '@playwright/test'

async function signIn(page: Page, displayName: string): Promise<void> {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: '先留下你的名字' }),
  ).toBeVisible()
  await page.getByLabel('你的姓名').fill(displayName)
  await page.getByRole('button', { name: '进入工作台' }).click()

  await expect(page.getByRole('dialog')).not.toBeVisible()
}

test('operator can enter, open an image, annotate, save and reload', async ({
  page,
}) => {
  await signIn(page, '自动化验收员')

  await expect(
    page.getByRole('heading', { name: /把问题/ }),
  ).toBeVisible()
  await expect(page.getByText('欢迎，自动化验收员')).not.toBeVisible({
    timeout: 7_000,
  })
  await page.screenshot({
    path: 'test-results/library.png',
    fullPage: true,
  })

  await page
    .getByRole('link', { name: /秋季新品主图/ })
    .click()
  await expect(page).toHaveURL(/\/images\/.+/)
  await expect(
    page.getByRole('heading', { name: '秋季新品主图' }),
  ).toBeVisible()

  const stage = page.getByRole('application')
  await expect(stage).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({
    path: 'test-results/image-workspace.png',
    fullPage: true,
  })

  const annotationItems = page.locator('.annotation-item')
  await expect(annotationItems).toHaveCount(3)

  const zoomValue = page.locator('.zoom-value')
  const initialZoom = await zoomValue.textContent()
  const zoomToolbar = page.locator('.zoom-toolbar')
  await zoomToolbar
    .getByRole('button', { name: '放大', exact: true })
    .click()
  await expect(zoomValue).not.toHaveText(initialZoom ?? '')
  await zoomToolbar
    .getByRole('button', { name: '适应', exact: true })
    .click()

  const box = await stage.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(
    box!.x + box!.width * 0.48,
    box!.y + box!.height * 0.75,
  )
  await page.mouse.down()
  await page.mouse.move(
    box!.x + box!.width * 0.55,
    box!.y + box!.height * 0.82,
    { steps: 5 },
  )
  await page.mouse.up()
  await expect(annotationItems).toHaveCount(3)
  await zoomToolbar
    .getByRole('button', { name: '适应', exact: true })
    .click()

  await page.mouse.click(
    box!.x + box!.width * 0.16,
    box!.y + box!.height * 0.16,
  )

  const noteField = page.getByLabel('标记说明')
  await expect(noteField).toBeVisible()
  await noteField.fill('E2E：按钮区域需要微调')

  const saveButton = page.getByRole('button', { name: '保存修改' })
  await expect(saveButton).toBeEnabled()
  await saveButton.click()
  await expect(page.getByText('标记已保存')).toBeVisible()

  await page.reload()
  await expect(page.getByText('E2E：按钮区域需要微调')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '先留下你的名字' }),
  ).not.toBeVisible()
})

test('operator can upload an image from the library', async ({ page }) => {
  await signIn(page, '上传验收员')

  await page.getByRole('button', { name: /上传一张图片/ }).click()
  await expect(
    page.getByRole('heading', { name: '上传一张审图素材' }),
  ).toBeVisible()

  await page
    .locator('input[type="file"]')
    .setInputFiles(
      fileURLToPath(
        new URL(
          '../../server/data/e2e-uploads/demo-weekend.png',
          import.meta.url,
        ),
      ),
    )
  await page.locator('#image-title').fill('浏览器上传验收图')
  await page.getByRole('button', { name: '上传并打开' }).click()

  await expect(
    page.getByRole('heading', { name: '浏览器上传验收图' }),
  ).toBeVisible()
  await expect(page.getByRole('application')).toBeVisible()
})
