-- Add submission link columns to student_groups table
-- These columns will store JSON strings containing multiple links
ALTER TABLE student_groups 
ADD COLUMN IF NOT EXISTS title_link TEXT,
ADD COLUMN IF NOT EXISTS pre_oral_link TEXT,
ADD COLUMN IF NOT EXISTS final_link TEXT;

-- Add title_status column to student_groups table
-- This will store a JSON string representing the status of each title (e.g., {"title1": "Approved", "title2": "Rejected"})
ALTER TABLE student_groups 
ADD COLUMN IF NOT EXISTS title_status TEXT DEFAULT '{}';

-- Enable RLS (if not already enabled)
ALTER TABLE student_groups ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow update access for all users (for development turn off specific RLS)
-- In production, you would want 'USING (auth.uid() = id)' or similar
DROP POLICY IF EXISTS "Enable all access for all users" ON "public"."student_groups";

create policy "Enable all access for all users"
on "public"."student_groups"
as PERMISSIVE
for ALL
to public
using (
  true
)
with check (
  true
);
