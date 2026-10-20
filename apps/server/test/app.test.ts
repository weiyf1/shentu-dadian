import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'

import { buildApp } from '../src/app.js'
import { openDatabase } from '../src/db/database.js'
import { seedDemoData } from '../src/db/seed.js'

interface TestContext {
  app: FastifyInstance
  directory: string
  uploadsDir: string
}

async function createContext(): Promise<TestContext> {
  const directory = await mkdtemp(join(tmpdir(), 'shentu-server-'))
  const uploadsDir = join(directory, 'uploads')
  const app = await buildApp({
    databasePath: join(directory, 'app.db'),
    uploadsDir,
  })

  return { app, directory, uploadsDir }
}

async function closeContext(context: TestContext): Promise<void> {
  await context.app.close()
  await rm(context.directory, { recursive: true, force: true })
}

async function createSession(
  app: FastifyInstance,
  displayName: string,
): Promise<{ id: string; displayName: string; color: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/session',
    payload: { displayName },
  })

  assert.equal(response.statusCode, 201)
  return response.json().operator
}

function insertImage(
  app: FastifyInstance,
  values: {
    id: string
    width?: number
    height?: number
    revision?: number
    nextNumber?: number
  },
): void {
  app.db
    .prepare(
      `INSERT INTO images (
        id, title, file_name, mime_type, width, height, revision,
        next_annotation_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      values.id,
      '测试图片',
      `${values.id}.png`,
      'image/png',
      values.width ?? 100,
      values.height ?? 100,
      values.revision ?? 1,
      values.nextNumber ?? 1,
    )
}

test('GET /api/health reports the server and database as ready', async () => {
  const context = await createContext()

  try {
    const response = await context.app.inject({
      method: 'GET',
      url: '/api/health',
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.json().status, 'ok')
    assert.equal(response.json().database.connected, true)
    assert.equal(response.json().database.migrationCount, 2)
  } finally {
    await closeContext(context)
  }
})

test('unknown routes return a structured 404 response', async () => {
  const context = await createContext()

  try {
    const response = await context.app.inject({
      method: 'GET',
      url: '/api/unknown',
    })

    assert.equal(response.statusCode, 404)
    assert.equal(response.json().error.code, 'NOT_FOUND')
    assert.equal(typeof response.json().error.requestId, 'string')
  } finally {
    await closeContext(context)
  }
})

test('session creates one operator per case-insensitive name', async () => {
  const context = await createContext()

  try {
    const first = await context.app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: { displayName: ' 王芳 ' },
    })
    const second = await context.app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: { displayName: '王芳' },
    })

    assert.equal(first.statusCode, 201)
    assert.equal(first.json().created, true)
    assert.equal(first.json().operator.displayName, '王芳')
    assert.match(first.json().operator.color, /^#[0-9A-F]{6}$/)

    assert.equal(second.statusCode, 200)
    assert.equal(second.json().created, false)
    assert.equal(second.json().operator.id, first.json().operator.id)
  } finally {
    await closeContext(context)
  }
})

test('write endpoints require a valid operator identity', async () => {
  const context = await createContext()
  const imageId = '33333333-3333-4333-8333-333333333333'

  try {
    const missing = await context.app.inject({
      method: 'POST',
      url: `/api/v1/images/${imageId}/annotations`,
      payload: {
        id: '44444444-4444-4444-8444-444444444444',
        x: 10,
        y: 10,
        note: '测试',
      },
    })
    const unknown = await context.app.inject({
      method: 'POST',
      url: `/api/v1/images/${imageId}/annotations`,
      headers: {
        'x-operator-id': '55555555-5555-4555-8555-555555555555',
      },
      payload: {
        id: '44444444-4444-4444-8444-444444444444',
        x: 10,
        y: 10,
        note: '测试',
      },
    })

    assert.equal(missing.statusCode, 400)
    assert.equal(missing.json().error.code, 'OPERATOR_REQUIRED')
    assert.equal(unknown.statusCode, 400)
    assert.equal(unknown.json().error.code, 'OPERATOR_REQUIRED')
  } finally {
    await closeContext(context)
  }
})

test('annotation CRUD persists the snapshot and checks versions', async () => {
  const context = await createContext()
  const imageId = '66666666-6666-4666-8666-666666666666'
  const annotationId = '77777777-7777-4777-8777-777777777777'

  try {
    const operator = await createSession(context.app, '王芳')
    insertImage(context.app, { id: imageId })
    const headers = { 'x-operator-id': operator.id }

    const created = await context.app.inject({
      method: 'POST',
      url: `/api/v1/images/${imageId}/annotations`,
      headers,
      payload: {
        id: annotationId,
        x: 25.126,
        y: 40,
        note: '  价格区域需要放大  ',
      },
    })
    assert.equal(created.statusCode, 201)
    assert.equal(created.json().annotation.number, 1)
    assert.equal(created.json().annotation.x, 25.13)
    assert.equal(created.json().annotation.note, '价格区域需要放大')
    assert.equal(created.json().imageRevision, 2)

    const retry = await context.app.inject({
      method: 'POST',
      url: `/api/v1/images/${imageId}/annotations`,
      headers,
      payload: {
        id: annotationId,
        x: 25.126,
        y: 40,
        note: '价格区域需要放大',
      },
    })
    assert.equal(retry.statusCode, 200)
    assert.equal(retry.json().annotation.id, annotationId)
    assert.equal(retry.json().imageRevision, 2)

    const staleUpdate = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/annotations/${annotationId}`,
      headers,
      payload: { note: '旧版本修改', version: 9 },
    })
    assert.equal(staleUpdate.statusCode, 409)
    assert.equal(staleUpdate.json().error.code, 'ANNOTATION_CONFLICT')

    const updated = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/annotations/${annotationId}`,
      headers,
      payload: { note: '价格区域需要放大到 36px', version: 1 },
    })
    assert.equal(updated.statusCode, 200)
    assert.equal(updated.json().annotation.version, 2)
    assert.equal(updated.json().imageRevision, 3)

    const detail = await context.app.inject({
      method: 'GET',
      url: `/api/v1/images/${imageId}`,
    })
    assert.equal(detail.statusCode, 200)
    assert.equal(detail.json().image.annotationCount, 1)
    assert.equal(detail.json().annotations[0].note, '价格区域需要放大到 36px')

    const staleDelete = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/annotations/${annotationId}?version=1`,
      headers,
    })
    assert.equal(staleDelete.statusCode, 409)

    const deleted = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/annotations/${annotationId}?version=2`,
      headers,
    })
    assert.equal(deleted.statusCode, 200)
    assert.equal(deleted.json().imageRevision, 4)

    const emptyDetail = await context.app.inject({
      method: 'GET',
      url: `/api/v1/images/${imageId}`,
    })
    assert.equal(emptyDetail.json().annotations.length, 0)
  } finally {
    await closeContext(context)
  }
})

test('batch save merges stale revisions and conflicts only on the same annotation', async () => {
  const context = await createContext()
  const imageId = '88888888-8888-4888-8888-888888888888'
  const firstId = '99999999-9999-4999-8999-999999999991'
  const secondId = '99999999-9999-4999-8999-999999999992'
  const thirdId = '99999999-9999-4999-8999-999999999993'
  const fourthId = '99999999-9999-4999-8999-999999999994'

  try {
    const operator = await createSession(context.app, '李雷')
    insertImage(context.app, {
      id: imageId,
      width: 1000,
      height: 800,
    })
    const headers = { 'x-operator-id': operator.id }

    const initial = await context.app.inject({
      method: 'POST',
      url: `/api/v1/images/${imageId}/annotations/batch`,
      headers,
      payload: {
        baseRevision: 1,
        creates: [
          { id: firstId, x: 100, y: 120, note: '主标题偏左' },
          { id: secondId, x: 500, y: 450, note: '按钮颜色太浅' },
        ],
        updates: [],
        deletes: [],
      },
    })
    assert.equal(initial.statusCode, 200)
    assert.equal(initial.json().imageRevision, 2)
    assert.deepEqual(
      initial.json().annotations.map((item: { number: number }) => item.number),
      [1, 2],
    )

    const merged = await context.app.inject({
      method: 'POST',
      url: `/api/v1/images/${imageId}/annotations/batch`,
      headers,
      payload: {
        observedRevision: 1,
        creates: [{ id: thirdId, x: 10, y: 10, note: '并发新增' }],
      },
    })
    assert.equal(merged.statusCode, 200)
    assert.equal(merged.json().imageRevision, 3)
    assert.equal(merged.json().concurrentChanges, true)
    assert.deepEqual(
      merged.json().annotations.map((item: { number: number }) => item.number),
      [1, 2, 3],
    )

    const next = await context.app.inject({
      method: 'POST',
      url: `/api/v1/images/${imageId}/annotations/batch`,
      headers,
      payload: {
        observedRevision: 3,
        creates: [{ id: fourthId, x: 900, y: 700, note: '新增角标' }],
        updates: [
          { id: firstId, version: 1, note: '主标题需要上移' },
        ],
        deletes: [{ id: secondId, version: 1 }],
      },
    })
    assert.equal(next.statusCode, 200)
    assert.equal(next.json().imageRevision, 4)
    assert.equal(next.json().concurrentChanges, false)
    assert.deepEqual(
      next.json().annotations.map((item: { number: number }) => item.number),
      [1, 3, 4],
    )
    assert.equal(next.json().annotations[0].version, 2)

    const annotationConflict = await context.app.inject({
      method: 'POST',
      url: `/api/v1/images/${imageId}/annotations/batch`,
      headers,
      payload: {
        observedRevision: 4,
        updates: [{ id: firstId, version: 1, note: '再次覆盖' }],
      },
    })
    assert.equal(annotationConflict.statusCode, 409)
    assert.equal(annotationConflict.json().error.code, 'ANNOTATION_CONFLICT')
    assert.equal(
      annotationConflict.json().error.details.currentNote,
      '主标题需要上移',
    )
  } finally {
    await closeContext(context)
  }
})

test('image upload accepts a valid image and rejects SVG', async () => {
  const context = await createContext()

  try {
    const operator = await createSession(context.app, '赵敏')
    const address = await context.app.listen({
      host: '127.0.0.1',
      port: 0,
    })
    const baseUrl = address.replace(/\/$/, '')
    const png = await sharp({
      create: {
        width: 40,
        height: 30,
        channels: 3,
        background: '#ef4444',
      },
    })
      .png()
      .toBuffer()

    const form = new FormData()
    form.append('title', '上传测试图')
    form.append('file', new Blob([png], { type: 'image/png' }), 'poster.png')

    const upload = await fetch(`${baseUrl}/api/v1/images`, {
      method: 'POST',
      headers: { 'X-Operator-Id': operator.id },
      body: form,
    })
    assert.equal(upload.status, 201)
    const uploaded = (await upload.json()) as {
      id: string
      width: number
      height: number
      title: string
    }
    assert.equal(uploaded.width, 40)
    assert.equal(uploaded.height, 30)
    assert.equal(uploaded.title, '上传测试图')

    const content = await fetch(
      `${baseUrl}/api/v1/images/${uploaded.id}/content`,
    )
    assert.equal(content.status, 200)
    assert.equal(content.headers.get('content-type'), 'image/png')
    assert.equal((await content.arrayBuffer()).byteLength > 0, true)
    const etag = content.headers.get('etag')
    assert.ok(etag)
    const cached = await fetch(
      `${baseUrl}/api/v1/images/${uploaded.id}/content`,
      { headers: { 'If-None-Match': etag } },
    )
    assert.equal(cached.status, 304)

    const invalidForm = new FormData()
    invalidForm.append(
      'file',
      new Blob(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], {
        type: 'image/svg+xml',
      }),
      'bad.svg',
    )
    const invalid = await fetch(`${baseUrl}/api/v1/images`, {
      method: 'POST',
      headers: { 'X-Operator-Id': operator.id },
      body: invalidForm,
    })
    assert.equal(invalid.status, 415)
    assert.equal(
      ((await invalid.json()) as { error: { code: string } }).error.code,
      'UNSUPPORTED_IMAGE_TYPE',
    )
  } finally {
    await closeContext(context)
  }
})

test('the 51st annotation is rejected with a conflict', async () => {
  const context = await createContext()
  const imageId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

  try {
    const operator = await createSession(context.app, '周婷')
    insertImage(context.app, {
      id: imageId,
      revision: 50,
      nextNumber: 51,
    })
    const insert = context.app.db.prepare(
      `INSERT INTO annotations (
        id, image_id, author_id, number, x, y, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )

    for (let number = 1; number <= 50; number += 1) {
      insert.run(
        `00000000-0000-4000-8000-${number.toString().padStart(12, '0')}`,
        imageId,
        operator.id,
        number,
        10,
        10,
        `标记 ${number}`,
      )
    }

    const response = await context.app.inject({
      method: 'POST',
      url: `/api/v1/images/${imageId}/annotations`,
      headers: { 'x-operator-id': operator.id },
      payload: {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        x: 20,
        y: 20,
        note: '第 51 个标记',
      },
    })

    assert.equal(response.statusCode, 409)
    assert.equal(response.json().error.code, 'ANNOTATION_LIMIT_REACHED')
  } finally {
    await closeContext(context)
  }
})

test('demo seed is idempotent and creates usable files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shentu-server-'))
  const database = openDatabase(join(directory, 'app.db'))
  const uploadsDir = join(directory, 'uploads')

  try {
    await seedDemoData(database, uploadsDir)
    await seedDemoData(database, uploadsDir)

    const images = database
      .prepare('SELECT COUNT(*) AS count FROM images')
      .get() as { count: number }
    const annotations = database
      .prepare('SELECT COUNT(*) AS count FROM annotations')
      .get() as { count: number }
    const firstImage = database
      .prepare(
        `SELECT id FROM images
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
      )
      .get() as { id: string }

    assert.equal(Number(images.count), 3)
    assert.equal(Number(annotations.count), 3)
    assert.equal(firstImage.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')
    assert.equal(existsSync(join(uploadsDir, 'demo-autumn.png')), true)
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), [])
  } finally {
    database.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('database rejects annotations outside the image and position changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shentu-server-'))
  const database = openDatabase(join(directory, 'app.db'))

  try {
    database
      .prepare(
        'INSERT INTO operators (id, display_name, color) VALUES (?, ?, ?)',
      )
      .run('operator-1', '王芳', '#2563EB')
    database
      .prepare(
        `INSERT INTO images (
          id, title, file_name, mime_type, width, height
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('image-1', '测试图片', 'image-1.png', 'image/png', 100, 100)

    const insertAnnotation = database.prepare(
      `INSERT INTO annotations (
        id, image_id, author_id, number, x, y, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    insertAnnotation.run(
      'annotation-1',
      'image-1',
      'operator-1',
      1,
      10,
      20,
      '主标题偏左',
    )

    assert.throws(
      () =>
        insertAnnotation.run(
          'annotation-2',
          'image-1',
          'operator-1',
          2,
          100,
          20,
          '越界标记',
        ),
      /annotation_out_of_bounds/,
    )
    assert.throws(
      () =>
        database
          .prepare('UPDATE annotations SET x = 11 WHERE id = ?')
          .run('annotation-1'),
      /annotation_position_immutable/,
    )
  } finally {
    database.close()
    await rm(directory, { recursive: true, force: true })
  }
})
