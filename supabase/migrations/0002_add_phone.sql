-- Add optional phone column to signatures.

alter table public.signatures
  add column if not exists phone text
    check (phone is null or length(phone) <= 32);
