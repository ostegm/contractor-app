import { Metadata } from "next";
import { login, signup } from './actions'
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Login - Contractor Estimator",
  description: "Login to your account",
};

// Use any for now to bypass the type error
export default function LoginPage(props: any) {
  const { searchParams = {} } = props;
  const errorMessage = searchParams.error === 'AuthenticationFailed'
    ? "Invalid email or password. Please try again."
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-gray-800 p-8 shadow-xl border border-gray-700">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Contractor Estimator</h1>
          <h2 className="text-xl font-medium text-gray-400 mb-6">
            Sign in to your account
          </h2>
        </div>
        
        {errorMessage && (
          <div className="rounded-md bg-red-900/30 border border-red-500/50 p-3 text-center">
            <p className="text-sm text-red-400">{errorMessage}</p>
          </div>
        )}

        <form className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-gray-200">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="bg-gray-700 border-gray-600 focus:border-blue-500"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-gray-200">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                placeholder="••••••••"
                className="bg-gray-700 border-gray-600 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <Button
              formAction={login}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Log in
            </Button>
            
            <div className="relative flex items-center justify-center">
              <div className="absolute w-full border-t border-gray-700"></div>
              <div className="relative bg-gray-800 px-4 text-sm text-gray-400">
                or
              </div>
            </div>
            
            <Button
              formAction={signup}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white border border-gray-600"
            >
              Create new account
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
} 