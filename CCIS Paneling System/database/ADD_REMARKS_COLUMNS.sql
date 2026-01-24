-- Add remarks columns for storing panel feedback
-- These will store JSON strings: {"title1": "Panel Name: Comment...", "ch1": "..."}
ALTER TABLE student_groups 
ADD COLUMN IF NOT EXISTS title_remarks TEXT DEFAULT '{}',
ADD COLUMN IF NOT EXISTS pre_oral_remarks TEXT DEFAULT '{}',
ADD COLUMN IF NOT EXISTS final_remarks TEXT DEFAULT '{}';
