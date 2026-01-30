-- Run this to enable saving comments to the Schedules table
-- This table usually has open permissions ("Enable all access") so saving should work here.

alter table schedules 
add column if not exists pdf_comments jsonb default '{}'::jsonb;
