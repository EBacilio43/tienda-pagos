import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileQuestion className="size-6" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Página no encontrada</h1>
        <p className="text-sm text-muted-foreground">La página que buscas no existe o fue movida.</p>
      </div>
      <Link href="/" className={buttonVariants({ size: "default" })}>
        Volver al inicio
      </Link>
    </div>
  );
}
