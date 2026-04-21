-- Migration: Add Adviser Approval tracking to student_groups
ALTER TABLE student_groups 
ADD COLUMN IF NOT EXISTS adviser_status JSONB DEFAULT '{}'::jsonB,
ADD COLUMN IF NOT EXISTS adviser_remarks JSONB DEFAULT '{}'::jsonB;

-- Optionally, you can initialize it with existing data if needed, but for now leave empty.
