-- Add defense_type column to payments table if it doesn't exist
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS defense_type text DEFAULT 'Title Defense';
