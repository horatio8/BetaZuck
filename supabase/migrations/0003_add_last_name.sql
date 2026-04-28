-- Add optional last_name column to signatures.

alter table public.signatures
  add column if not exists last_name text
    check (last_name is null or length(last_name) <= 80);
