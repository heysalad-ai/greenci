import { DurableObject } from 'cloudflare:workers';
import { deviceMessageSchema } from '@greenci/deck-protocol';
import { eventSchema } from '@greenci/db';
import type { ApiEnv } from './env.js';

export class OrgRoom extends DurableObject<ApiEnv> {
  private streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].send(JSON.stringify({ type: 'connected' }));
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (request.method === 'POST') {
      const event = eventSchema.parse(await request.json());
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(JSON.stringify(event));
        } catch {
          socket.close(1011, 'Connection unavailable');
        }
      }
      const encoded = new TextEncoder().encode(
        `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      );
      for (const stream of this.streams) {
        try {
          stream.enqueue(encoded);
        } catch {
          this.streams.delete(stream);
        }
      }
      return Response.json({ accepted: true });
    }
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start: (value) => {
        controller = value;
        this.streams.add(value);
        value.enqueue(new TextEncoder().encode(': connected\n\n'));
      },
      cancel: () => {
        this.streams.delete(controller);
      },
    });
    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    // Subscribers cannot publish arbitrary application events.
    if (message === 'ping') socket.send('pong');
    else socket.close(1008, 'Read-only subscription');
  }
  webSocketClose(socket: WebSocket, code: number, reason: string) {
    socket.close(code, reason);
  }
}

export class DeckSession extends DurableObject<ApiEnv> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return new Response('WebSocket required', { status: 426 });
    const pair = new WebSocketPair();
    pair[1].serializeAttachment({
      serial: new URL(request.url).searchParams.get('serial'),
    });
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 4096) {
      socket.close(1009, 'Invalid message size');
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      socket.close(1008, 'Invalid JSON');
      return;
    }
    const parsed = deviceMessageSchema.safeParse(json);
    if (!parsed.success) {
      socket.close(1008, 'Invalid deck message');
      return;
    }
    const serial = (socket.deserializeAttachment() as { serial: string })
      .serial;
    const msg = parsed.data;
    if (msg.type === 'hello') {
      if (msg.serial !== serial) {
        socket.close(1008, 'Serial mismatch');
        return;
      }
      socket.serializeAttachment({ serial, ready: true });
      socket.send(JSON.stringify({ type: 'face', mood: 'key-ready' }));
      for (const key of ['command', 'diagnose', 'repair', 'verify'])
        socket.send(
          JSON.stringify({ type: 'lights', key, mode: 'idle', color: 'green' }),
        );
    } else {
      if (!(socket.deserializeAttachment() as { ready?: boolean }).ready) {
        socket.close(1008, 'Send hello first');
        return;
      }
      if (msg.type === 'key') {
        socket.send(
          JSON.stringify({ type: 'ack', key: msg.key, action: msg.action }),
        );
        await this.env.ORG_ROOMS.get(
          this.env.ORG_ROOMS.idFromName('local'),
        ).fetch('https://room/publish', {
          method: 'POST',
          body: JSON.stringify({
            id: crypto.randomUUID(),
            type: 'deck.key',
            payload: { serial, ...msg },
            at: new Date().toISOString(),
          }),
        });
      }
    }
  }
  webSocketClose(socket: WebSocket, code: number, reason: string) {
    socket.close(code, reason);
  }
}
