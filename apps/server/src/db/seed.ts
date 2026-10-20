import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

import sharp from 'sharp'

import { withImmediateTransaction } from './transaction.js'

const DEMO_OPERATORS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: '王芳',
    color: '#2563EB',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: '李雷',
    color: '#059669',
  },
] as const

const PRIMARY_DEMO_OPERATOR = DEMO_OPERATORS[0]

interface DemoImage {
  id: string
  title: string
  fileName: string
  width: number
  height: number
  revision: number
  nextAnnotationNumber: number
  svg: string
}

const DEMO_IMAGES: DemoImage[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    title: '秋季新品主图',
    fileName: 'demo-autumn.png',
    width: 1600,
    height: 900,
    revision: 2,
    nextAnnotationNumber: 4,
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#FDF3E6"/>
            <stop offset="100%" stop-color="#F4C38C"/>
          </linearGradient>
          <linearGradient id="orb" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#E45B2B"/>
            <stop offset="100%" stop-color="#9C2F18"/>
          </linearGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#bg)"/>
        <circle cx="1260" cy="450" r="310" fill="url(#orb)"/>
        <rect x="100" y="120" width="680" height="12" rx="6" fill="#8B3E25"/>
        <text x="100" y="290" font-family="Arial, sans-serif" font-size="92"
          font-weight="700" fill="#5A261A">NEW SEASON</text>
        <text x="100" y="430" font-family="Arial, sans-serif" font-size="58"
          fill="#7A3A27">AUTUMN COLLECTION 2026</text>
        <rect x="100" y="540" width="400" height="112" rx="56" fill="#5A261A"/>
        <text x="300" y="614" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="44"
          font-weight="700" fill="#FFF8F0">SHOP NOW</text>
        <text x="1260" y="480" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="126"
          font-weight="700" fill="#FFF6EA">50%</text>
        <text x="1260" y="560" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="52"
          fill="#FFF6EA">OFF</text>
      </svg>
    `,
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    title: '春日轻食商品详情',
    fileName: 'demo-fresh.png',
    width: 1200,
    height: 1600,
    revision: 1,
    nextAnnotationNumber: 1,
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#EAF7EE"/>
            <stop offset="100%" stop-color="#B9E4C7"/>
          </linearGradient>
        </defs>
        <rect width="1200" height="1600" fill="url(#bg)"/>
        <circle cx="600" cy="690" r="360" fill="#4F9D69"/>
        <circle cx="600" cy="690" r="260" fill="#DFF5E5"/>
        <path d="M470 700 Q600 470 730 700 Q600 930 470 700Z" fill="#2E7D4F"/>
        <text x="600" y="160" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="72"
          font-weight="700" fill="#1E5A39">FRESH DROP</text>
        <text x="600" y="1280" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="66"
          font-weight="700" fill="#1E5A39">LIGHT &amp; NATURAL</text>
        <text x="600" y="1380" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="42"
          fill="#3D7A58">NEW PRODUCT DETAIL PAGE</text>
        <rect x="410" y="1440" width="380" height="88" rx="44" fill="#1E5A39"/>
        <text x="600" y="1498" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="36"
          font-weight="700" fill="#F5FFF8">VIEW DETAILS</text>
      </svg>
    `,
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    title: '周末促销方图',
    fileName: 'demo-weekend.png',
    width: 1080,
    height: 1080,
    revision: 1,
    nextAnnotationNumber: 1,
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#16233F"/>
            <stop offset="100%" stop-color="#365A92"/>
          </linearGradient>
        </defs>
        <rect width="1080" height="1080" fill="url(#bg)"/>
        <rect x="80" y="80" width="920" height="920" rx="48"
          fill="none" stroke="#F4D27A" stroke-width="8"/>
        <circle cx="770" cy="300" r="170" fill="#F4D27A"/>
        <text x="770" y="340" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="76"
          font-weight="700" fill="#16233F">2 DAYS</text>
        <text x="120" y="390" font-family="Arial, sans-serif" font-size="92"
          font-weight="700" fill="#FFFFFF">WEEKEND</text>
        <text x="120" y="500" font-family="Arial, sans-serif" font-size="92"
          font-weight="700" fill="#F4D27A">SALE</text>
        <text x="120" y="650" font-family="Arial, sans-serif" font-size="48"
          fill="#DDE7F7">Selected items only</text>
        <rect x="120" y="760" width="460" height="112" rx="56" fill="#F4D27A"/>
        <text x="350" y="834" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="40"
          font-weight="700" fill="#16233F">SHOP THE DROP</text>
      </svg>
    `,
  },
]

const PRIMARY_DEMO_IMAGE = DEMO_IMAGES[0]!

async function writeDemoImage(
  uploadsDir: string,
  image: DemoImage,
): Promise<{ byteSize: number; checksum: string }> {
  const filePath = join(uploadsDir, image.fileName)

  if (!existsSync(filePath)) {
    await sharp(Buffer.from(image.svg))
      .png({ compressionLevel: 9 })
      .toFile(filePath)
  }

  const file = await readFile(filePath)
  return {
    byteSize: file.length,
    checksum: createHash('sha256').update(file).digest('hex'),
  }
}

export async function seedDemoData(
  database: DatabaseSync,
  uploadsDir: string,
): Promise<void> {
  const imageCount = database
    .prepare('SELECT COUNT(*) AS count FROM images')
    .get() as { count: number }

  if (Number(imageCount.count) > 0) {
    return
  }

  await mkdir(uploadsDir, { recursive: true })

  const files = new Map<
    string,
    { byteSize: number; checksum: string }
  >()
  for (const image of DEMO_IMAGES) {
    files.set(image.id, await writeDemoImage(uploadsDir, image))
  }

  withImmediateTransaction(database, () => {
    for (const operator of DEMO_OPERATORS) {
      database
        .prepare(
          `INSERT OR IGNORE INTO operators (id, display_name, color)
           VALUES (?, ?, ?)`,
        )
        .run(operator.id, operator.name, operator.color)
    }

    const operatorIds = new Map<string, string>()
    for (const operator of DEMO_OPERATORS) {
      const row = database
        .prepare('SELECT id FROM operators WHERE display_name = ? COLLATE NOCASE')
        .get(operator.name) as { id: string } | undefined
      if (!row) {
        throw new Error('Failed to resolve demo operator')
      }
      operatorIds.set(operator.id, row.id)
    }

    const primaryOperatorId = operatorIds.get(PRIMARY_DEMO_OPERATOR.id)
    if (!primaryOperatorId) {
      throw new Error('Missing primary demo operator')
    }

    // Insert the annotated demo image last so it appears first in the list.
    for (const image of [...DEMO_IMAGES].reverse()) {
      const file = files.get(image.id)
      if (!file) {
        throw new Error('Missing demo image metadata')
      }

      database
        .prepare(
          `INSERT OR IGNORE INTO images (
            id, title, file_name, original_name, mime_type, byte_size,
            checksum_sha256, width, height, revision,
            next_annotation_number, created_by_id, created_at
          ) VALUES (?, ?, ?, ?, 'image/png', ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          image.id,
          image.title,
          image.fileName,
          image.fileName,
          file.byteSize,
          file.checksum,
          image.width,
          image.height,
          image.revision,
          image.nextAnnotationNumber,
          primaryOperatorId,
          new Date(
            Date.now() - DEMO_IMAGES.indexOf(image) * 1000,
          ).toISOString(),
        )
    }

    const demoAnnotations = [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
        number: 1,
        x: 480,
        y: 300,
        note: '主标题和背景对比不够，远看不够醒目',
        authorId: PRIMARY_DEMO_OPERATOR.id,
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
        number: 2,
        x: 1260,
        y: 480,
        note: '折扣数字需要再放大，避免被商品图遮挡',
        authorId: DEMO_OPERATORS[1].id,
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
        number: 3,
        x: 300,
        y: 596,
        note: '按钮文案建议改成“立即查看”',
        authorId: PRIMARY_DEMO_OPERATOR.id,
      },
    ]

    for (const annotation of demoAnnotations) {
      database
        .prepare(
          `INSERT OR IGNORE INTO annotations (
            id, image_id, author_id, number, x, y, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          annotation.id,
          PRIMARY_DEMO_IMAGE.id,
          operatorIds.get(annotation.authorId) ?? annotation.authorId,
          annotation.number,
          annotation.x,
          annotation.y,
          annotation.note,
        )
    }
  })
}
