-- Create table for storing PDF annotations separately
CREATE TABLE IF NOT EXISTS public.capstone_annotations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id BIGINT,
    defense_type TEXT,
    file_key TEXT,
    user_name TEXT,
    annotated_file_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(group_id, defense_type, file_key, user_name)
);

-- Disable RLS (Row Level Security) for easier access
ALTER TABLE public.capstone_annotations DISABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON public.capstone_annotations TO postgres;
GRANT ALL ON public.capstone_annotations TO anon;
GRANT ALL ON public.capstone_annotations TO authenticated;
GRANT ALL ON public.capstone_annotations TO service_role;

-- ---------------------------------------------------------
-- MIGRATION: Transfer existing annotations from Feedback Table
-- ---------------------------------------------------------
INSERT INTO public.capstone_annotations (group_id, defense_type, file_key, user_name, annotated_file_url, updated_at)
SELECT group_id, defense_type, file_key, user_name, annotated_file_url, updated_at
FROM public.capstone_feedback
WHERE annotated_file_url IS NOT NULL
ON CONFLICT (group_id, defense_type, file_key, user_name) 
DO UPDATE SET annotated_file_url = EXCLUDED.annotated_file_url, updated_at = EXCLUDED.updated_at;

-- Optional: If you want to clean up the old table (remove redundant data)
-- UPDATE public.capstone_feedback SET annotated_file_url = NULL WHERE annotated_file_url IS NOT NULL;
