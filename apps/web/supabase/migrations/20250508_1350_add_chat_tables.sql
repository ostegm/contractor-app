CREATE TABLE chat_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TRIGGER update_chat_threads_updated_at
    BEFORE UPDATE ON chat_threads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_chat_threads_project_id ON chat_threads(project_id);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage chat threads for their projects" ON chat_threads
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = chat_threads.project_id
        AND projects.user_id = auth.uid()
    ));

-- chat_events table
CREATE TABLE chat_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    -- Store structured event data based on BAML types
    -- UserInput: { message: string }
    -- AssisantMessage: { message: string }
    -- UpdateEstimateRequest: { changes_to_make: string }
    -- UpdateEstimateResponse: { success: bool, error_message: string }
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX idx_chat_events_thread_id ON chat_events(thread_id);
CREATE INDEX idx_chat_events_created_at ON chat_events(created_at); -- For polling

ALTER TABLE chat_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage chat events for their project threads" ON chat_events
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM chat_threads
        WHERE chat_threads.id = chat_events.thread_id
        AND EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = chat_threads.project_id
            AND projects.user_id = auth.uid()
        )
    )); 