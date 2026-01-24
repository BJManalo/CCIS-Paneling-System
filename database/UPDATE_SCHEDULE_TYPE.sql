-- Run this to add the 'schedule_type' column to your 'schedules' table
ALTER TABLE schedules 
ADD COLUMN IF NOT EXISTS schedule_type text;
