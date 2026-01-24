-- Add payment_date column to payments table
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS payment_date date DEFAULT CURRENT_DATE;
