// Dependencies
import { z } from 'zod'

export const searchBody = z.object({
  origin: z.string().toUpperCase().regex(/^[A-Z]{3}$/),
  destination: z.string().toUpperCase().regex(/^[A-Z]{3}$/),

  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const [year, month, day] = value.split('-').map(Number)
      const parsed = new Date(Date.UTC(year!, month! - 1, day!))
      return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month! - 1 &&
        parsed.getUTCDate() === day
      )
    }, 'data inválida'),
})

export type SearchInput = z.infer<typeof searchBody>
