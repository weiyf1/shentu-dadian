import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import type { Page } from '@playwright/test'

async function signIn(page: Page, displayName: string): Promise<void> {
  await page.goto('/')

  await expect(page.getByRole('dialog')).toBeVisible()
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
  const zoomInButton = zoomToolbar.getByRole('button', {
    name: '放大',
    exact: true,
  })
  for (let step = 0; step < 3; step += 1) {
    await zoomInButton.click()
  }
  await expect(zoomValue).not.toHaveText(initialZoom ?? '')
  await expect
    .poll(async () => Number.parseInt((await zoomValue.textContent()) ?? '0', 10))
    .toBeGreaterThanOrEqual(90)

  const markerPin = page.locator('.marker-pin').first()
  await expect(markerPin).toBeVisible()
  const scaledAncestors = await markerPin.evaluate((element) => {
    const scaled: string[] = []
    let current = element.parentElement

    while (current && !current.classList.contains('image-stage')) {
      const transform = getComputedStyle(current).transform
      if (transform !== 'none') {
        const matrix = new DOMMatrixReadOnly(transform)
        if (
          Math.abs(matrix.a - 1) > 0.001 ||
          Math.abs(matrix.d - 1) > 0.001
        ) {
          scaled.push(
            `${current.className}: scale(${matrix.a}, ${matrix.d})`,
          )
        }
      }
      current = current.parentElement
    }

    return scaled
  })
  expect(scaledAncestors).toEqual([])
  await page.screenshot({
    path: 'test-results/marker-zoom.png',
    fullPage: true,
  })

  await zoomToolbar
    .getByRole('button', { name: '适应', exact: true })
    .click()

  const box = await stage.boundingBox()
  expect(box).not.toBeNull()
  const imageBox = await page.locator('.image-content').boundingBox()
  expect(imageBox).not.toBeNull()

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
    imageBox!.x + imageBox!.width * 0.25,
    imageBox!.y + imageBox!.height * 0.8,
  )
  await expect(
    page.getByText('新标记', { exact: true }).first(),
  ).toBeVisible()

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

test('different tabs can use different operators from the same browser', async ({
  page,
  context,
}) => {
  await signIn(page, '甲操作员')
  await expect(page.locator('.operator-name')).toHaveText('甲操作员')

  const secondPage = await context.newPage()
  await secondPage.goto('/')
  await expect(secondPage.getByRole('dialog')).toBeVisible()
  await secondPage.locator('#operator-name').fill('乙操作员')
  await secondPage.getByRole('button', { name: '进入工作台' }).click()
  await expect(secondPage.getByRole('dialog')).not.toBeVisible()

  await expect(secondPage.locator('.operator-name')).toHaveText('乙操作员')
  await expect(page.locator('.operator-name')).toHaveText('甲操作员')

  await page
    .getByRole('button', { name: '切换', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({
    path: 'test-results/operator-switcher.png',
    fullPage: true,
  })
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /乙操作员/ })
    .click()
  await expect(page.locator('.operator-name')).toHaveText('乙操作员')

  await secondPage.reload()
  await expect(secondPage.locator('.operator-name')).toHaveText('乙操作员')

  await page
    .getByRole('button', { name: '切换', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /甲操作员/ })
    .click()
  await expect(page.locator('.operator-name')).toHaveText('甲操作员')
  await expect(secondPage.locator('.operator-name')).toHaveText('乙操作员')
})

test('saved changes stream to another tab while preserving local drafts', async ({
  page,
  context,
}) => {
  await signIn(page, '实时甲')
  await page
    .getByRole('link', { name: /秋季新品主图/ })
    .click()
  await expect(page.getByRole('application')).toBeVisible()
  const imageUrl = page.url()

  const secondPage = await context.newPage()
  await secondPage.goto('/')
  await expect(secondPage.getByRole('dialog')).toBeVisible()
  await secondPage.locator('#operator-name').fill('实时乙')
  await secondPage.getByRole('button', { name: '进入工作台' }).click()
  await expect(secondPage.getByRole('dialog')).not.toBeVisible()
  await secondPage.goto(imageUrl)
  await expect(secondPage.getByRole('application')).toBeVisible()

  const localDraft = secondPage.getByLabel('标记说明')
  await expect(localDraft).toBeVisible()
  await localDraft.fill('实时乙的本地草稿')

  const stage = page.getByRole('application')
  await page.waitForTimeout(400)
  const box = await stage.boundingBox()
  expect(box).not.toBeNull()
  const imageBox = await page.locator('.image-content').boundingBox()
  expect(imageBox).not.toBeNull()
  await page.bringToFront()
  await stage.click({
    position: {
      x: imageBox!.x - box!.x + imageBox!.width * 0.25,
      y: imageBox!.y - box!.y + imageBox!.height * 0.5,
    },
  })
  await expect(
    page.getByText('新标记', { exact: true }).first(),
  ).toBeVisible()
  await page.getByLabel('标记说明').fill('实时新增标记')
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByText('标记已保存').last()).toBeVisible()

  await expect(
    secondPage.getByText('实时新增标记', { exact: true }),
  ).toBeVisible({ timeout: 2_000 })
  await expect(localDraft).toHaveValue('实时乙的本地草稿')

  await page
    .locator('.annotation-panel')
    .getByRole('button', { name: /主标题和背景对比不够/ })
    .click()
  await page.getByLabel('标记说明').fill('实时甲修改了同一条标记')
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByText('标记已保存').last()).toBeVisible()

  await expect(
    secondPage.getByText('远端已修改此标记', { exact: true }),
  ).toBeVisible({ timeout: 2_000 })
  await expect(localDraft).toHaveValue('实时乙的本地草稿')

  await secondPage
    .getByRole('button', { name: '保留我的草稿' })
    .click()
  await expect(
    secondPage.getByText('远端已修改此标记', { exact: true }),
  ).not.toBeVisible()
  await secondPage.getByRole('button', { name: '保存修改' }).click()
  await expect(
    secondPage.getByText('标记已保存'),
  ).toBeVisible()
  await expect(
    page.getByText('实时乙的本地草稿', { exact: true }),
  ).toBeVisible({ timeout: 2_000 })
})
