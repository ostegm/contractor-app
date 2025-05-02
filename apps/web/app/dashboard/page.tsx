import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { DeleteProjectButton } from "./DeleteProjectButton"
import Link from "next/link"
import { NewProjectButton } from "@/components/new-project-button"
import { NewProjectDialog } from "@/components/new-project-dialog"

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect('/login')
  }

  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)

  if (projectsError) {
    redirect('/error')
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Projects</h1>
          <div className="flex items-center">
            <p className="text-sm text-gray-400 mr-4">Welcome, {user.email}</p>
          </div>
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* New Project Card */}
          <NewProjectButton />
          
          {/* Existing Projects */}
          {projects.map((project) => (
            <Link href={`/projects/${project.id}`} key={project.id}>
              <div className="rounded-lg bg-gray-800 border border-gray-700 p-6 h-[220px] hover:border-blue-500/50 hover:bg-gray-800/80 transition-all duration-200 flex flex-col">
                <div className="flex-1">
                  <h3 className="text-lg font-medium mb-2 text-blue-400">{project.name}</h3>
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">{project.description}</p>
                  
                  {/* Show AI estimate info if available */}
                  {project.ai_estimate && (
                    <div className="bg-gray-900/50 rounded p-3 border border-gray-700">
                      <div className="text-sm">
                        <div className="text-gray-400 mb-1">Estimated Cost:</div>
                        <div className="text-green-400 font-semibold">
                          {(() => {
                            try {
                              const estimate = JSON.parse(project.ai_estimate);
                              return `$${estimate.estimated_total_min.toLocaleString()} - $${estimate.estimated_total_max.toLocaleString()}`;
                            } catch (e) {
                              return "Available";
                            }
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-700">
                  <span className="text-xs text-gray-500">
                    {new Date(project.created_at).toLocaleDateString()}
                  </span>
                  <DeleteProjectButton projectId={project.id} />
                </div>
              </div>
            </Link>
          ))}
        </div>
        
        {projects.length === 0 && (
          <div className="text-center mt-8 p-8 border border-dashed border-gray-700 rounded-lg">
            <p className="text-gray-400 mb-4">No projects yet. Create your first project to get started.</p>
          </div>
        )}
      </div>
      
      {/* Project creation dialog as client component */}
      <NewProjectDialog />
    </div>
  )
}

