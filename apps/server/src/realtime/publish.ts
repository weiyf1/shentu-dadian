import type { DatabaseSync } from 'node:sqlite'

import type { Operator } from '../domain/types.js'
import { getImageSummary } from '../services/images.js'
import type {
  ImageChangedEventInput,
  ImageEventHub,
} from './event-hub.js'

export function publishImageChanged(
  hub: ImageEventHub,
  database: DatabaseSync,
  options: {
    imageId: string
    actor: Operator
    sourceClientId: string | null
    changed: ImageChangedEventInput['changed']
  },
): void {
  const image = getImageSummary(database, options.imageId)
  if (!image) return

  hub.publish({
    type: 'image.changed',
    imageId: image.id,
    revision: image.revision,
    annotationCount: image.annotationCount,
    lastAnnotatedAt: image.lastAnnotatedAt,
    actor: {
      id: options.actor.id,
      displayName: options.actor.displayName,
      color: options.actor.color,
    },
    sourceClientId: options.sourceClientId,
    changed: options.changed,
  })
}
