-- create test users
INSERT INTO
    auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) (
        select
            '00000000-0000-0000-0000-000000000000',
            uuid_generate_v4 (),
            'authenticated',
            'authenticated',
            'user' || (ROW_NUMBER() OVER ()) || '@example.com',
            crypt ('somespecialpassword', gen_salt ('bf')),
            current_timestamp,
            current_timestamp,
            current_timestamp,
            '{"provider":"email","providers":["email"]}',
            '{}',
            current_timestamp,
            current_timestamp,
            '',
            '',
            '',
            ''
        FROM
            generate_series(1, 3)
    );

-- test user email identities
INSERT INTO
    auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    ) (
        select
            uuid_generate_v4 (),
            id,
            id as user_id,
            format('{"sub":"%s","email":"%s"}', id::text, email)::jsonb,
            'email',
            current_timestamp,
            current_timestamp,
            current_timestamp
        from
            auth.users
        where
          email LIKE '%@example.com' -- here
    );

DO $$
DECLARE
    user_id_val UUID; -- Filled in by querying users table.
    project1_id UUID;
    project2_id UUID;
    project1_info TEXT;
    project2_info TEXT;
    project1_estimate JSONB;
    file1_content TEXT;
    file2_description TEXT;
    file3_content TEXT;
BEGIN
    -- Dynamically get user_id for user1@example.com
    SELECT id INTO user_id_val FROM auth.users WHERE email = 'user1@example.com';

    -- Check if user_id_val was found
    IF user_id_val IS NULL THEN
        RAISE EXCEPTION 'User user1@example.com not found in auth.users table.';
    END IF;

    -- Content from run_file_processor_api.ts for project_info
    project1_info := '# Bathroom Renovation Project
    Initial consultation for bathroom renovation in a 1990s home.';
    project2_info := '# Kitchen Refresh Project
    Initial consultation for kitchen refresh in a 1970s home.';

    -- -- Content for client_notes.txt
    -- file1_content := 'Client wants a modern bathroom with a walk-in shower, double vanity, and heated floors. Budget is $15,000-$20,000. Timeline: would like to complete within 3 months.';

    -- -- Description for current_bathroom.png
    -- file2_description := 'Image shows a dated bathroom with beige tile, a shower/tub combo, single vanity with cultured marble top, and limited storage. The bathroom has oak cabinets and patterned floor tiles.';

    -- -- Content for measurements.txt
    -- file3_content := 'Bathroom dimensions: 8ft x 10ft. Ceiling height: 8ft. Window on east wall. Plumbing on north and west walls.';

    -- Content from construction_estimate_api.json
    project1_estimate := '"{\"project_description\":\"Modern bathroom renovation in an 8x10 ft (1990s) home, including full demolition, double vanity installation, walk-in shower upgrade, heated floor addition, new fixtures, tiling, and updated lighting to meet a contemporary design aesthetic within a $15,000-$20,000 budget.\",\"estimated_total_min\":15000,\"estimated_total_max\":20000,\"estimated_timeline_days\":60,\"key_considerations\":[\"Conversion from a single to double vanity requires plumbing modification.\",\"Walk-in shower requires waterproofing and substantial carpentry/tile work.\",\"Heated floors increase flooring and electrical scope complexity.\",\"Scope must be balanced to maintain project within the $15,000-$20,000 budget.\",\"Material lead times and contractor scheduling may impact the 3-month timeline.\"],\"confidence_level\":\"Medium\",\"estimate_items\":[{\"description\":\"Demolition and removal of existing fixtures, tile, flooring, vanity, and wallpaper\",\"category\":\"Demo\",\"subcategory\":\"Full demo\",\"cost_range_min\":1200,\"cost_range_max\":1800,\"unit\":\"sq ft\",\"quantity\":80,\"assumptions\":\"Includes safe removal and disposal of all bathroom finishes, fixtures, and cabinetry.\",\"confidence_score\":\"High\",\"notes\":\"No suspected hazardous material abatement (e.g., asbestos) included.\"},{\"description\":\"Rough and finish plumbing updates for double vanity and new walk-in shower (includes new drains, supply lines, rough-ins, fixtures install)\",\"category\":\"Plumbing\",\"subcategory\":\"Vanity/shower\",\"cost_range_min\":1800,\"cost_range_max\":2400,\"unit\":\"bathroom\",\"quantity\":1,\"assumptions\":\"Plumbing modifications kept within same bathroom; no need to reroute main lines.\",\"confidence_score\":\"Medium\",\"notes\":\"Includes new shutoffs and possible relocation to fit expanded vanity/walk-in shower.\"},{\"description\":\"Electrical work: heated floor circuit, GFCI outlets, LED lighting, new switches\",\"category\":\"Electrical\",\"subcategory\":\"Heated floor/lighting\",\"cost_range_min\":1200,\"cost_range_max\":1600,\"unit\":\"bathroom\",\"quantity\":1,\"assumptions\":\"Existing panel supports increased load; limited new circuit pulls required.\",\"confidence_score\":\"Medium\",\"notes\":\"Includes basic dimmable LED overhead/recessed lighting and vanity lights.\"},{\"description\":\"Walk-in shower construction (pan, waterproofing, tile, glass door, plumbing fixtures)\",\"category\":\"Finish Work\",\"subcategory\":\"Shower\",\"cost_range_min\":3500,\"cost_range_max\":5000,\"unit\":\"each\",\"quantity\":1,\"assumptions\":\"Midrange decorative tile and fixtures; standard-size glass door/enclosure.\",\"confidence_score\":\"Medium\",\"notes\":\"Bench/niche optional, not included unless requested.\"},{\"description\":\"Double vanity supply and installation (cabinetry, countertop, sinks, faucets, hardware)\",\"category\":\"Finish Work\",\"subcategory\":\"Vanity\",\"cost_range_min\":1800,\"cost_range_max\":2500,\"unit\":\"each\",\"quantity\":1,\"assumptions\":\"Prefabricated or semi-custom double vanity, quartz/similar top, modern fixtures.\",\"confidence_score\":\"Medium\",\"notes\":\"Does not include high-end custom cabinetry.\"},{\"description\":\"Heated floor system (materials, installation, compatible with new tile)\",\"category\":\"Flooring\",\"subcategory\":\"In-floor heating\",\"cost_range_min\":1200,\"cost_range_max\":1600,\"unit\":\"sq ft\",\"quantity\":80,\"assumptions\":\"Electric radiant mat system, thermostat included.\",\"confidence_score\":\"Medium\",\"notes\":\"Assumes subfloor is in good condition.\"},{\"description\":\"Tile supply and installation (floor and walls, midrange modern porcelain/ceramic)\",\"category\":\"Finish Work\",\"subcategory\":\"Tile\",\"cost_range_min\":2800,\"cost_range_max\":3500,\"unit\":\"sq ft\",\"quantity\":200,\"assumptions\":\"Includes floor, shower walls, and baseboard tile; decorative banding/extras limited.\",\"confidence_score\":\"Medium\",\"notes\":\"Assumes 12x24 or similar standard tile size; premium tile not included.\"},{\"description\":\"Painting and wall repair (post-wallpaper removal)\",\"category\":\"Finish Work\",\"subcategory\":\"Paint/repair\",\"cost_range_min\":600,\"cost_range_max\":900,\"unit\":\"sq ft\",\"quantity\":80,\"assumptions\":\"One primer and two finish coats; patching after wallpaper removal.\",\"confidence_score\":\"High\",\"notes\":\"Assumes minimal drywall replacement.\"},{\"description\":\"New toilet supply and installation (modern elongated, water-saving model)\",\"category\":\"Finish Work\",\"subcategory\":\"Toilet\",\"cost_range_min\":400,\"cost_range_max\":600,\"unit\":\"each\",\"quantity\":1,\"assumptions\":\"Midgrade model with slow-close seat.\",\"confidence_score\":\"High\",\"notes\":\"No relocation of toilet plumbing.\"},{\"description\":\"Finish carpentry and accessories (trim, mirrors, towel bars, storage niche/shelving)\",\"category\":\"Finish Work\",\"subcategory\":\"Accessories/carpentry\",\"cost_range_min\":700,\"cost_range_max\":900,\"unit\":\"bathroom\",\"quantity\":1,\"assumptions\":\"Standard trim, mirrors, towel hardware, basic shelving as per modern style.\",\"confidence_score\":\"Medium\",\"notes\":\"Custom millwork or special-order items not included.\"}],\"next_steps\":[\"Clarify specific material and fixture selections (vanity model, tile choice, fixture finishes, glass type, heated floor system).\",\"Site visit to verify plumbing/electrical panel capacity and measure for potential conflicts or necessary relocation.\",\"Develop proposed floor plan to ensure double vanity and walk-in shower fit and code compliance.\",\"Refine estimate based on chosen products and selections.\",\"Confirm lead times for key finish materials (vanity, tile, glass).\"],\"missing_information\":[\"Exact models/styles/material selections (vanity, tile, plumbing fixtures, shower glass, heated floor brand).\",\"Condition of existing subfloor and any framing/structural concerns.\",\"Electrical panel capacity for additional load.\",\"Preference for specific accessories (medicine cabinet, mirrors, shelving).\",\"Any need for layout changes or structural modifications.\",\"Known site access limitations or HOA guidelines.\"],\"key_risks\":[\"Scope creep due to material upgrades or additional work discovered during demolition.\",\"Plumbing or electrical issues requiring greater-than-anticipated modifications.\",\"Material delivery delays impacting schedule.\",\"Unforeseen subfloor or structural repairs needed after demolition.\",\"Budget overrun due to finish/fixture selections outside midrange cost basis.\"]}"';

    -- Project 1: Files and Estimate
    INSERT INTO projects (user_id, name, description, project_info, ai_estimate)
    VALUES (user_id_val, 'Bathroom Renovation (Estimated)', '1990s bathroom remodel with modern features, estimate complete.', project1_info, project1_estimate)
    RETURNING id INTO project1_id;

    INSERT INTO files (project_id, file_name, file_url, description)
    VALUES
        (project1_id, 'client_notes.txt', 'project1/client_notes.txt', 'Client requirements and budget for bathroom renovation.'),
        (project1_id, 'current_bathroom.png', 'project1/current_bathroom.png', 'Current bathroom photo.'),
        (project1_id, 'measurements.txt', 'project1/measurements.txt', 'Bathroom dimensions and layout details.');

    -- Mark estimate as complete for Project 1
    INSERT INTO task_jobs (project_id, status, job_type)
    VALUES (project1_id, 'completed', 'initial_estimate');

    -- Project 2: Files Only
    INSERT INTO projects (user_id, name, description, project_info, ai_estimate)
    VALUES (user_id_val, 'Kitchen Refresh (Files Uploaded)', 'Major kitchen refresh project, files uploaded, awaiting estimate.', project2_info, NULL)
    RETURNING id INTO project2_id;

    INSERT INTO files (project_id, file_name, file_url, description)
    VALUES
        (project2_id, 'current_kitchen.png', 'project2/current_kitchen.png', 'Current kitchen photo.'),
        (project2_id, 'desired_kitchen.png', 'project2/desired_kitchen.png', 'Hypothetical end state showing goal of project.'),
        (project2_id, 'walkthrough_notes.txt', 'project2/walkthrough_notes.txt', 'Notes from walkthrough of the kitchen.');


    RAISE NOTICE 'Seeding complete. Project 1 ID: %, Project 2 ID: %', project1_id, project2_id;

    -- Add Chat Threads and Events
    DECLARE
        thread1_id UUID := uuid_generate_v4();
        thread2_id UUID := uuid_generate_v4();
        thread3_id UUID := uuid_generate_v4();
        thread4_id UUID := uuid_generate_v4();
        event_time_today TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;
        event_time_yesterday TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP - INTERVAL '1 day';
        event_time_older TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP - INTERVAL '3 days';
    BEGIN
        -- Project 1 Threads
        INSERT INTO chat_threads (id, project_id, name, created_at, updated_at) VALUES
            (thread1_id, project1_id, 'Initial Bathroom Ideas', event_time_older, event_time_older + INTERVAL '10 minutes'),
            (thread2_id, project1_id, 'Follow-up Questions', event_time_yesterday, event_time_yesterday + INTERVAL '5 minutes');

        -- Project 1 Events (Thread 1 - Older)
        INSERT INTO chat_events (thread_id, event_type, data, created_at) VALUES
            (thread1_id, 'UserInput', jsonb_build_object('message', 'What kind of tile options do you recommend for a modern look?'), event_time_older),
            (thread1_id, 'AssisantMessage', jsonb_build_object('message', 'Large format porcelain tiles in neutral colors like gray or white are popular for modern bathrooms. Matte finishes can also enhance the contemporary feel.'), event_time_older + INTERVAL '1 minute'),
            (thread1_id, 'UserInput', jsonb_build_object('message', 'Okay, thanks. And what about heated floors?'), event_time_older + INTERVAL '5 minutes'),
            (thread1_id, 'AssisantMessage', jsonb_build_object('message', 'Heated floors are a great addition for comfort. We can integrate an electric radiant heat system under the tiles. It adds about $1200-$1600 to the estimate.'), event_time_older + INTERVAL '6 minutes'),
            (thread1_id, 'UserInput', jsonb_build_object('message', 'Okay, lets add those.'), event_time_older + INTERVAL '6 minutes'),
            (thread1_id, 'UpdateEstimateRequest', jsonb_build_object('changes_to_make', 'Confirm addition of heated floor system to the estimate: add Heated floor system (materials, installation, compatible with new tile) item with quantity 80 sq ft and cost range $1200-$1600 as already present in the estimate. Confirm electrical line for heated floors remains included.'), event_time_older + INTERVAL '7 minutes'),
            (thread1_id, 'UpdateEstimateResponse', jsonb_build_object('success', true, 'error_message', ''), event_time_older + INTERVAL '7 minutes');

        -- Project 1 Events (Thread 2 - Yesterday)
        INSERT INTO chat_events (thread_id, event_type, data, created_at) VALUES
            (thread2_id, 'UserInput', jsonb_build_object('message', 'Regarding the estimate, can we switch the vanity selection?'), event_time_yesterday),
            (thread2_id, 'AssisantMessage', jsonb_build_object('message', 'Absolutely. Do you have a specific model or style in mind? Changing the vanity may adjust the cost.'), event_time_yesterday + INTERVAL '1 minute'),
            (thread2_id, 'UserInput', jsonb_build_object('message', 'I uploaded a picture of one I liked.'), event_time_yesterday + INTERVAL '4 minutes')
            -- (thread2_id, 'FileUpload', jsonb_build_object('file_name', 'preferred_vanity.jpg', 'file_id', uuid_generate_v4()), event_time_yesterday + INTERVAL '5 minutes')
            ;

        -- Project 2 Threads
        INSERT INTO chat_threads (id, project_id, name, created_at, updated_at) VALUES
            (thread3_id, project2_id, 'Kitchen Layout Discussion', event_time_older - INTERVAL '1 day', event_time_older - INTERVAL '1 day' + INTERVAL '20 minutes'),
            (thread4_id, project2_id, 'Appliance Choices', event_time_today, event_time_today + INTERVAL '2 minutes');

        -- Project 2 Events (Thread 3 - Older)
        INSERT INTO chat_events (thread_id, event_type, data, created_at) VALUES
            (thread3_id, 'UserInput', jsonb_build_object('message', 'Hi, let''s talk about the kitchen layout. I uploaded the current and desired state pictures.'), event_time_older - INTERVAL '1 day'),
            -- (thread3_id, 'FileUpload', jsonb_build_object('file_name', 'current_kitchen.png', 'file_id', uuid_generate_v4()), event_time_older - INTERVAL '1 day' + INTERVAL '1 minute'),
            -- (thread3_id, 'FileUpload', jsonb_build_object('file_name', 'desired_kitchen.png', 'file_id', uuid_generate_v4()), event_time_older - INTERVAL '1 day' + INTERVAL '2 minutes'),
            (thread3_id, 'AssisantMessage', jsonb_build_object('message', 'Thanks for uploading those. Looking at the desired state, it seems you want to open up the space between the kitchen and dining area. Is that correct?'), event_time_older - INTERVAL '1 day' + INTERVAL '5 minutes'),
            (thread3_id, 'UserInput', jsonb_build_object('message', 'Yes, exactly. And add an island if possible.'), event_time_older - INTERVAL '1 day' + INTERVAL '10 minutes'),
            (thread3_id, 'AssisantMessage', jsonb_build_object('message', 'Okay, removing that wall and adding an island are significant changes. I''ll factor that into the planning and upcoming estimate.'), event_time_older - INTERVAL '1 day' + INTERVAL '11 minutes');

        -- Project 2 Events (Thread 4 - Today)
        INSERT INTO chat_events (thread_id, event_type, data, created_at) VALUES
            (thread4_id, 'UserInput', jsonb_build_object('message', 'What range/oven brands do you typically work with?'), event_time_today),
            (thread4_id, 'AssisantMessage', jsonb_build_object('message', 'We commonly install brands like Bosch, KitchenAid, and GE Profile, but we can accommodate most major brands based on your preference and budget.'), event_time_today + INTERVAL '1 minute');

        RAISE NOTICE 'Chat threads and events seeding complete.';
    END;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error during seeding: %', SQLERRM;
        ROLLBACK;
END $$;
