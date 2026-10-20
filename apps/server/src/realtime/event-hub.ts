import type { FastifyReply, FastifyRequest } from 'fastify'

export interface ImageChangedEventInput {
  type: 'image.changed'
  imageId: string
  revision: number
  annotationCount: number
  lastAnnotatedAt: string | null
  actor: {
    id: string
    displayName: string
    color: string
  }
  sourceClientId: string | null
  changed: {
    created: string[]
    updated: string[]
    deleted: string[]
  }
}

export interface ImageChangedEvent extends ImageChangedEventInput {
  eventId: number
}

interface SseClient {
  reply: FastifyReply
  clientId: string | null
}

export class ImageEventHub {
  private readonly clients = new Set<SseClient>()
  private readonly heartbeat: NodeJS.Timeout
  private nextEventId = 1

  constructor() {
    this.heartbeat = setInterval(() => {
      this.writeToAll(': heartbeat\n\n')
    }, 15_000)
    this.heartbeat.unref()
  }

  subscribe(
    request: FastifyRequest,
    reply: FastifyReply,
    clientId: string | null,
  ): void {
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    reply.raw.flushHeaders()

    const client: SseClient = { reply, clientId }
    this.clients.add(client)

    this.writeClient(
      client,
      `event: connected\ndata: ${JSON.stringify({
        serverTime: new Date().toISOString(),
      })}\n\n`,
    )

    request.raw.once('close', () => {
      this.clients.delete(client)
    })
  }

  publish(input: ImageChangedEventInput): ImageChangedEvent {
    const event: ImageChangedEvent = {
      ...input,
      eventId: this.nextEventId,
    }
    this.nextEventId += 1

    this.writeToAll(
      `event: image.changed\nid: ${event.eventId}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    return event
  }

  close(): void {
    clearInterval(this.heartbeat)
    this.writeToAll('event: shutdown\ndata: {}\n\n')
    for (const client of this.clients) {
      client.reply.raw.end()
    }
    this.clients.clear()
  }

  private writeToAll(message: string): void {
    for (const client of [...this.clients]) {
      this.writeClient(client, message, true)
    }
  }

  private writeClient(
    client: SseClient,
    message: string,
    removeOnFailure = false,
  ): void {
    try {
      client.reply.raw.write(message)
    } catch {
      this.clients.delete(client)
      if (removeOnFailure) {
        client.reply.raw.end()
      }
    }
  }
}
