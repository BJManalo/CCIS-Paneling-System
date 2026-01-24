-- Run this to finalize your 'grades' table structure
-- 1. Remove the 'remarks' column
ALTER TABLE grades 
DROP COLUMN IF EXISTS remarks;

-- 2. Rename 'final_grade' to just 'grade'
ALTER TABLE grades 
RENAME COLUMN final_grade TO grade;
