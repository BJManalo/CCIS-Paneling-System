-- Create schedules table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.schedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES public.student_groups(id) ON DELETE CASCADE,
    schedule_type TEXT NOT NULL,
    schedule_date DATE NOT NULL,
    schedule_time TIME NOT NULL,
    schedule_venue TEXT NOT NULL,
    panel1 TEXT,
    panel2 TEXT,
    panel3 TEXT,
    panel4 TEXT,
    panel5 TEXT,
    adviser TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, schedule_type) -- Prevent duplicate schedules of same type for a group
);

-- Enable Row Level Security
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- Policy: Allow full access to all (since we use custom auth)
-- Ideally, we would restrict this, but without Supabase Auth, we rely on app logic.
CREATE POLICY "Enable all access for all users" ON public.schedules
    FOR ALL USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_schedules_group_id ON public.schedules(group_id);
