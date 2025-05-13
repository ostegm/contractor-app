-- Add columns to files table
ALTER TABLE files
ADD COLUMN origin TEXT DEFAULT 'user',
ADD COLUMN parent_file_id UUID REFERENCES files(id);

-- Create index for parent_file_id
CREATE INDEX IF NOT EXISTS files_parent_idx ON files(parent_file_id);
