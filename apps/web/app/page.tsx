import { Github } from "lucide-react"
import Link from "next/link"

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto mt-8 px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-4 text-gray-100">Contractor Estimate App</h1>
        <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-6 mb-8">
          <p className="text-lg text-yellow-200 mb-4">
            ⚠️ The backend service for this app has been taken down.
          </p>
          <p className="text-gray-300 mb-4">
            Check out the demo below to see how it worked, or visit the GitHub repository for the source code.
          </p>
          <Link 
            href="https://github.com/ostegm/contractor-app"
            className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="w-5 h-5" />
            View on GitHub
          </Link>
        </div>
      </div>
      
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-100">Demo Video</h2>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-gray-900">
          <video 
            controls 
            className="w-full h-full"
            preload="metadata"
          >
            <source src="/demo.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      </div>
    </div>
  )
}

