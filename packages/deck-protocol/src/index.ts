import { z } from 'zod';
export const keySchema = z.enum(['command', 'diagnose', 'repair', 'verify']);
export const deviceMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    serial: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
    firmware: z.string().max(64),
  }),
  z.object({
    type: z.literal('key'),
    key: keySchema,
    action: z.enum(['press', 'long_press']),
  }),
  z.object({ type: z.literal('heartbeat') }),
]);
export const hostMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('lights'),
    key: keySchema,
    mode: z.enum([
      'off',
      'idle',
      'breathe',
      'sweep',
      'steady',
      'flash',
      'fill',
    ]),
    color: z.enum(['orange', 'blue', 'amber', 'green']),
    progress: z.number().min(0).max(1).optional(),
  }),
  z.object({
    type: z.literal('face'),
    mood: z.enum([
      'key-ready',
      'key-failing',
      'key-diagnosing',
      'key-repairing',
      'key-verifying',
      'key-passing',
      'key-shipped',
    ]),
  }),
  z.object({
    type: z.literal('ack'),
    key: keySchema,
    action: z.enum(['press', 'long_press']),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type DeviceMessage = z.infer<typeof deviceMessageSchema>;
export type HostMessage = z.infer<typeof hostMessageSchema>;
