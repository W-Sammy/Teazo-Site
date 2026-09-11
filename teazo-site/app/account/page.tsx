import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function AccountPage() {
    const session = await auth()

    if (!session?.user) {
        redirect("/login")
    }

    return (
        <main>
            <h1>Welcome, {session.user.name}</h1>
            <p>{session.user.email}</p>
        </main>
    )
}