-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    project_info TEXT, -- Added from 20240624 migration
    ai_estimate JSONB, -- Added from 20240625 migration
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
COMMENT ON COLUMN projects.ai_estimate IS 'Stores AI-generated construction estimates in JSON format'; -- Added from 20240625 migration

-- Apply the update trigger to projects table
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Files table
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    description TEXT, -- Added from 20240624 migration
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Chat interactions table
CREATE TABLE chat_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_ai_estimate ON projects USING GIN (ai_estimate); -- Added from 20240625 migration
CREATE INDEX idx_files_project_id ON files(project_id);
CREATE INDEX idx_files_description ON files(description); -- Added from 20240624 migration
CREATE INDEX idx_chat_interactions_project_id ON chat_interactions(project_id);
CREATE INDEX idx_chat_interactions_user_id ON chat_interactions(user_id);

-- Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY; -- Added from 20240224 migration
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; -- Added from 20240224 migration

-- Create policies for projects
CREATE POLICY "Users can view their own projects" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own projects" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own projects" ON projects FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own projects" ON projects FOR DELETE USING (auth.uid() = user_id);

-- Create policies for files (Using the consolidated policy from 20240224_storage_policies.sql)
CREATE POLICY "Users can manage their project files" ON files
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = files.project_id
    AND projects.user_id = auth.uid()
  )
);

-- Create policies for chat interactions
CREATE POLICY "Users can view chat interactions of their projects" ON chat_interactions FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = chat_interactions.project_id
        AND projects.user_id = auth.uid()
    ));
CREATE POLICY "Users can create chat interactions in their projects" ON chat_interactions FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = chat_interactions.project_id
        AND projects.user_id = auth.uid()
    ));

-- Create the storage bucket if it doesn't exist (From 20240224_create_bucket.sql)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contractor-app-dev', 'contractor-app-dev', false)
ON CONFLICT (id) DO NOTHING;

-- Create policies for storage.buckets (From 20240224_storage_policies.sql)
CREATE POLICY "Give users access to own bucket" ON storage.buckets
  FOR ALL USING (auth.uid() = owner);

-- Create policies for storage.objects (From 20240224_storage_policies.sql)
CREATE POLICY "Give users access to own objects" ON storage.objects
  FOR ALL USING (
    bucket_id = 'contractor-app-dev' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text
      FROM projects
      WHERE user_id = auth.uid()
    )
  );

-- Allow public access to files if needed (optional - From 20240224_storage_policies.sql)
CREATE POLICY "Give public access to files" ON storage.objects
  FOR SELECT USING (bucket_id = 'contractor-app-dev');