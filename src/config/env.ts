import "dotenv/config";
import { z } from "zod";

const envBoolean = z.preprocess(value => {
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return value;
}, z.boolean());

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(4010),
  CORS_ORIGIN: z.string().default("http://localhost:4005"),
  DATABASE_URL: z.string().min(1),
  SOURCE_BASE_URL: z.string().url().default("https://mycollectrics.com"),
  ENABLE_CRON: envBoolean.default(false),
  SCRAPE_CRON: z.string().default("0 */6 * * *"),
  CRON_TIMEZONE: z.string().default("Asia/Bangkok"),
  SCRAPE_ON_START: envBoolean.default(false),
  SCRAPE_INCLUDE_SEARCH: envBoolean.default(true),
  SEARCH_PAGE_SIZE: z.coerce.number().int().positive().default(250),
  SEARCH_MAX_PAGES: z.coerce.number().int().positive().default(20),
  CARD_DETAIL_REFRESH_LIMIT: z.coerce.number().int().nonnegative().default(0),
  EBAY_LISTINGS_REFRESH_LIMIT: z.coerce.number().int().nonnegative().default(25),
  ALLOW_ON_DEMAND_INGEST: envBoolean.default(false)
});

export const env = schema.parse(process.env);
