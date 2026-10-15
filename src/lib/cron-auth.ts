// SERVER-ONLY. Vercel Cron calls each scheduled route with
// `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET environment
// variable is set on the project (vercel.com/docs/cron-jobs/manage-cron-jobs).
// Fails closed: without CRON_SECRET nothing runs, so a deploy that forgot
// the variable can never be triggered by a stranger.

import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
