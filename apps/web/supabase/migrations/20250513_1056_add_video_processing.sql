-- Add columns to files table
ALTER TABLE files
ADD COLUMN origin TEXT DEFAULT 'user',
ADD COLUMN parent_file_id UUID REFERENCES files(id) ON DELETE CASCADE;

-- Create index for parent_file_id
CREATE INDEX IF NOT EXISTS files_parent_idx ON files(parent_file_id);


-- Add file_id to task_jobs table
ALTER TABLE task_jobs
ADD COLUMN file_id UUID REFERENCES files(id) ON DELETE CASCADE DEFAULT NULL;