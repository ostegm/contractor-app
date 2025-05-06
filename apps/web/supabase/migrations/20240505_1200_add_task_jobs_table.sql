-- Create task_jobs table
CREATE TABLE task_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    thread_id TEXT,
    run_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    job_type TEXT NOT NULL, -- e.g., 'estimate_generation'
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Apply the update trigger
CREATE TRIGGER update_task_jobs_updated_at
    BEFORE UPDATE ON task_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create index
CREATE INDEX idx_task_jobs_project_id ON task_jobs(project_id);
CREATE INDEX idx_task_jobs_status ON task_jobs(status);

-- Row Level Security
ALTER TABLE task_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for task_jobs
CREATE POLICY "Users can view task jobs for their projects" ON task_jobs FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = task_jobs.project_id
        AND projects.user_id = auth.uid()
    ));

-- Create insert policy
CREATE POLICY "Users can create task jobs for their projects" ON task_jobs FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = task_jobs.project_id
        AND projects.user_id = auth.uid()
    ));

-- Create update policy
CREATE POLICY "Users can update task jobs for their projects" ON task_jobs FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = task_jobs.project_id
        AND projects.user_id = auth.uid()
    ));