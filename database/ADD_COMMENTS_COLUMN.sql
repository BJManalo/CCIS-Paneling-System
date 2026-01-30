-- Run this in your Supabase SQL Editor to enable the alternate saving method
-- This adds a column to your EXISTING 'student_groups' table to store PDF comments directly
-- This avoids the need for a separate 'pdf_annotations' table which seems to be having issues

alter table student_groups 
add column if not exists pdf_comments jsonb default '{}'::jsonb;

-- Ensure panels can update this column (Policy update might be needed depending on your existing setup)
-- Usually existing policies for 'update' will cover this new column automatically.
