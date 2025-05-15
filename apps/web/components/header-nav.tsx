'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, Briefcase, Cog } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export function HeaderNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Don't show header on login page
  if (pathname === '/login') {
    return null;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <>
      <header className="bg-gray-800 text-white p-4 h-16">
        <div className="flex justify-between items-center h-full">
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center">
              <h1 className="text-xl font-bold">Contractor Estimator</h1>
            </Link>
          </div>
          
          <div className="hidden md:flex items-center space-x-4">
            <Link href="/dashboard" passHref>
              <Button variant="ghost" className="text-gray-300 hover:text-white">
                <Briefcase className="mr-2 h-5 w-5" />
                <span>Projects</span>
              </Button>
            </Link>
            <Button variant="ghost" className="text-gray-500 cursor-not-allowed" disabled>
              <Cog className="mr-2 h-5 w-5" />
              <span>Settings</span>
            </Button>
            <Button 
              variant="ghost" 
              className="text-gray-300 hover:text-white"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-5 w-5" />
              <span>Logout</span>
            </Button>
          </div>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-gray-900/90">
          <div className="p-4 bg-gray-800 min-h-screen">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Menu</h2>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="text-2xl">&times;</span>
              </Button>
            </div>
            <nav className="mt-6 space-y-4">
              <Link 
                href="/dashboard" 
                className="flex items-center p-2 rounded hover:bg-gray-700 text-gray-200"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Briefcase className="mr-3 h-5 w-5" />
                <span>Projects</span>
              </Link>
              <div className="flex items-center p-2 rounded text-gray-500 cursor-not-allowed">
                <Cog className="mr-3 h-5 w-5" />
                <span>Settings</span>
              </div>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-left p-2 rounded hover:bg-gray-700 text-gray-200"
                onClick={() => {
                  handleSignOut();
                  setMobileMenuOpen(false);
                }}
              >
                <LogOut className="mr-3 h-5 w-5" />
                <span>Logout</span>
              </Button>
            </nav>
          </div>
        </div>
      )}
    </>
  );
} 