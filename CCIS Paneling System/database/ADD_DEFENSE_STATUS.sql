-- Add status columns for defense stages
ALTER TABLE student_groups 
ADD COLUMN IF NOT EXISTS pre_oral_status TEXT DEFAULT '{}',
ADD COLUMN IF NOT EXISTS final_status TEXT DEFAULT '{}';
