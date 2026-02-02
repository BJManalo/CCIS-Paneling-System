-- Clean up legacy or incorrect defense type records
DELETE FROM public.capstone_feedback 
WHERE defense_type IN ('titledefense', 'preoraldefense', 'finaldefense');
