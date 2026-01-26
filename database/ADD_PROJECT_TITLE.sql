-- SQL command to add the 'project_title' column to the 'student_groups' table
-- This allows storing the real title input by students
ALTER TABLE student_groups 
ADD COLUMN IF NOT EXISTS project_title TEXT;
