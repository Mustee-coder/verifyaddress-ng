import { z } from "zod";

export const postcodeSchema = z.object({
  state: z.string().trim().length(2),
  lga: z.string().trim().length(2),
  district: z.string().trim().length(3),
  area: z.string().trim().length(2),
  unit: z.string().trim().length(2),
});

export type PostcodeInput = z.infer<typeof postcodeSchema>;
