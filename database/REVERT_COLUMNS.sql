-- Run this to undo the changes to the tables
ALTER TABLE student_groups DROP COLUMN IF EXISTS pdf_comments;
ALTER TABLE schedules DROP COLUMN IF EXISTS pdf_comments;
