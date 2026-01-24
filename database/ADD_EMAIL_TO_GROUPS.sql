-- SQL command to add the 'email' column to the 'student_groups' table
-- This allows student groups to have a dedicated login email

ALTER TABLE student_groups 
ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;

-- Optional: Update existing groups with a placeholder email if needed
-- UPDATE student_groups SET email = group_name || '@ccis.ph' WHERE email IS NULL;
