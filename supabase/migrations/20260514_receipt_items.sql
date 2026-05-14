-- Add line items to receipts so the Digital tab can render the full
-- breakdown (every item the customer bought) instead of just merchant +
-- total. JSONB shape (validated server-side by Zod in the parser):
--
--   [
--     { "label": "Red Bull 250ml", "qty": 2, "unit_amount": 19.50,
--       "total_amount": 39.00 },
--     { "label": "Tomater Cherry 250g", "qty": null, "unit_amount": null,
--       "total_amount": 24.90 }
--   ]
--
-- Nullable + defaulted to NULL so existing rows pre-line-items stay
-- valid. The parser fills it going forward; manual rows can stay null.

alter table public.receipts
  add column if not exists items jsonb;

-- Optional integrity check — items must be an array if present. Avoids
-- accidental {} or string payloads from a buggy parser landing here.
alter table public.receipts
  drop constraint if exists receipts_items_is_array;

alter table public.receipts
  add constraint receipts_items_is_array
  check (items is null or jsonb_typeof(items) = 'array');
