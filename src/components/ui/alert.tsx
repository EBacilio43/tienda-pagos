import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { CircleAlert, CircleCheck, TriangleAlert, Info } from "lucide-react"

import { cn } from "@/lib/utils"

// Fase 9 / ADR-17. Cuatro variantes, cada una sobre un token — nunca una
// clase de paleta cruda (regla 10). `error`/`exito` llevan role="alert"
// porque son feedback de una operación que el usuario necesita que un
// lector de pantalla anuncie; `aviso`/`info` son contexto pasivo.
const alertVariants = cva(
  "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        error: "border-destructive/25 bg-destructive/10 text-destructive",
        exito: "border-exito/25 bg-exito/10 text-exito",
        aviso: "border-devolucion/25 bg-devolucion/10 text-devolucion",
        info: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "info" },
  }
)

const ICONO_POR_VARIANTE = {
  error: CircleAlert,
  exito: CircleCheck,
  aviso: TriangleAlert,
  info: Info,
} as const

function Alert({
  className,
  variant = "info",
  icono = true,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & { icono?: boolean }) {
  const Icono = ICONO_POR_VARIANTE[variant ?? "info"]
  return (
    <div
      data-slot="alert"
      role={variant === "error" || variant === "exito" ? "alert" : undefined}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {icono ? <Icono /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export { Alert, alertVariants }
