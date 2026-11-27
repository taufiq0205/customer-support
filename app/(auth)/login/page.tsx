import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-7 text-center font-heading text-lg font-semibold tracking-tight">CX Support Tool</p>
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader>
            <CardTitle>
              <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
