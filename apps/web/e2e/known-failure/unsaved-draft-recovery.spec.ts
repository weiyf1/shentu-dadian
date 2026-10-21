import { expect, test } from '@playwright/test'

test('known failure: unsaved draft is lost after forced page close', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByLabel('你的姓名').fill('草稿恢复验收员')
  await page.getByRole('button', { name: '进入工作台' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()

  await page
    .getByRole('link', { name: /秋季新品主图/ })
    .click()
  await expect(page.getByRole('application')).toBeVisible()
  const imageUrl = page.url()

  const stage = page.getByRole('application')
  const stageBox = await stage.boundingBox()
  const imageBox = await page.locator('.image-content').boundingBox()
  expect(stageBox).not.toBeNull()
  expect(imageBox).not.toBeNull()

  await stage.click({
    position: {
      x: imageBox!.x - stageBox!.x + imageBox!.width * 0.25,
      y: imageBox!.y - stageBox!.y + imageBox!.height * 0.8,
    },
  })
  await expect(
    page.getByText('新标记', { exact: true }).first(),
  ).toBeVisible()
  await page
    .getByLabel('标记说明')
    .fill('尚未保存的草稿恢复测试')

  await page.close({ runBeforeUnload: false })

  const reopenedPage = await context.newPage()
  await reopenedPage.goto(imageUrl)
  await reopenedPage
    .getByRole('dialog')
    .getByRole('button', { name: /草稿恢复验收员/ })
    .click()
  await expect(reopenedPage.getByRole('dialog')).not.toBeVisible()

  await expect(
    reopenedPage.getByText('尚未保存的草稿恢复测试', { exact: true }),
  ).toBeVisible()
})
