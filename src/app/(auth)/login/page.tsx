import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { leerSesion } from "@/server/auth/session";
import { APP_CONFIG } from "@/lib/config";

export default async function LoginPage() {
  const usuario = await leerSesion();
  if (usuario) {
    redirect("/");
  }

  return (
    <div className="w-full max-w-sm overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10">
      <div className="bg-primary px-6 py-5 text-primary-foreground">
        <p className="font-heading text-lg font-semibold">{APP_CONFIG.nombre}</p>
        <p className="text-sm text-primary-foreground/80">Ingresa con tu usuario y contraseña</p>
      </div>
      <div className="p-6">
        <LoginForm />
      </div>
    </div>
  );
}
