import { z } from 'zod';

export const categorySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  archivedAt: z.coerce.date().nullable()
});
export type Category = z.infer<typeof categorySchema>;

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(120)
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
