-- Run this to simplify the grades table
-- 1. Remove unnecessary grading columns
ALTER TABLE grades 
DROP COLUMN IF EXISTS proposal_grade,
DROP COLUMN IF EXISTS oral_defense_grade,
DROP COLUMN IF EXISTS document_grade;

-- We will just use 'final_grade' as the single grade column.
-- If you want to rename it strictly to 'grade':
-- ALTER TABLE grades RENAME COLUMN final_grade TO grade;
-- But staying with final_grade is fine for compatibility.
