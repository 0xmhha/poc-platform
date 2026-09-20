import { z } from 'zod'
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const credentials = z
    .array(
      z
        .object({
          key: z.string().min(32),
          merchantId: z.string().min(1).max(100),
          role: z.enum(['merchant', 'operator']),
        })
        .strict()
    )
    .min(1)
    .parse(JSON.parse(env.PAYMENT_API_KEYS ?? '[]'))
  if (new Set(credentials.map((c) => c.key)).size !== credentials.length)
    throw new Error('Duplicate API keys')
  const mode = z.enum(['simulator', 'provider']).parse(env.PAYMENT_MODE ?? 'simulator')
  const webhookSecret = z.string().min(32).parse(env.PAYMENT_WEBHOOK_SECRET)
  const targets = z
    .record(z.string(), z.object({ url: z.string().url(), secret: z.string().min(32) }).strict())
    .parse(JSON.parse(env.PAYMENT_WEBHOOK_TARGETS ?? '{}'))
  for (const t of Object.values(targets)) {
    const u = new URL(t.url)
    if (
      u.username ||
      u.password ||
      u.hash ||
      (u.protocol !== 'https:' &&
        !(
          mode === 'simulator' &&
          u.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
        ))
    )
      throw new Error('Webhook target must use HTTPS (loopback allowed in simulation)')
  }
  return {
    credentials,
    mode,
    webhookSecret,
    targets,
    database: env.PAYMENT_DATABASE ?? './data/payments.sqlite',
    port: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.PORT ?? 4353),
    host: env.HOST ?? '127.0.0.1',
    providerURL: env.PAYMENT_PROVIDER_URL,
    providerToken: env.PAYMENT_PROVIDER_TOKEN,
    providerName: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,39}$/)
      .parse(env.PAYMENT_PROVIDER_NAME ?? 'gateway'),
  }
}
