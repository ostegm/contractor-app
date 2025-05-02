import { redirect } from "next/navigation";

// This page simply redirects to the dashboard
export default function ProjectsPage() {
  redirect('/dashboard');
}