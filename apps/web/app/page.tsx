import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  return (
    <div className="max-w-md mx-auto mt-8">
      <h2 className="text-2xl font-bold mb-4 text-gray-100">Login</h2>
      <form className="space-y-4">
        <div>
          <Label htmlFor="email" className="text-gray-300">
            Email
          </Label>
          <Input
            type="email"
            id="email"
            placeholder="Enter your email"
            className="bg-gray-700 text-white border-gray-600"
          />
        </div>
        <div>
          <Label htmlFor="password" className="text-gray-300">
            Password
          </Label>
          <Input
            type="password"
            id="password"
            placeholder="Enter your password"
            className="bg-gray-700 text-white border-gray-600"
          />
        </div>
        <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
          Log In
        </Button>
      </form>
    </div>
  )
}

