-- Run this to update your existing 'schedules' table
-- Add columns for Panel 4 and Panel 5
ALTER TABLE schedules 
ADD COLUMN panel4 text,
ADD COLUMN panel5 text;
