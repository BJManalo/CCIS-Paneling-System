-- Add title_status column to student_groups table
-- This will store a JSON string representing the status of each title (e.g., {"title1": "Approved", "title2": "Rejected"})
ALTER TABLE student_groups 
ADD COLUMN IF NOT EXISTS title_status TEXT DEFAULT '{}';
