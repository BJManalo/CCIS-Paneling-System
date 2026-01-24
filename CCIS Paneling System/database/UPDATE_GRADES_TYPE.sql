-- Run this to add the 'grade_type' column to your grades table
ALTER TABLE grades 
ADD COLUMN IF NOT EXISTS grade_type text;
