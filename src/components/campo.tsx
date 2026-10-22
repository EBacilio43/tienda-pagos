import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Fase 9 / ADR-17. `cliente-form.tsx` y `usuario-form.tsx` tenían cada uno
// su propio helper local `Campo`, byte-equivalentes, y otros 5 formularios
// repetían la misma marcación a mano — 27 sitios en 10 archivos. Esto
// deduplica lo que ya existía, no anticipa nada nuevo (regla 9).

/** Props comunes de accesibilidad para un control dentro de <Campo>. */
export function propsControl(id: string, errores?: string[]) {
  return {
    id,
    name: id,
    "aria-invalid": errores?.[0] ? (true as const) : undefined,
    "aria-describedby": errores?.[0] ? `${id}-error` : undefined,
  };
}

export function Campo({
  id,
  label,
  errores,
  ayuda,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  errores?: string[];
  ayuda?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {errores?.[0] ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {errores[0]}
        </p>
      ) : ayuda ? (
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      ) : null}
    </div>
  );
}

export function CampoTexto({
  id,
  label,
  errores,
  ayuda,
  type = "text",
  defaultValue,
  placeholder,
  required,
  className,
  ...rest
}: {
  id: string;
  label: ReactNode;
  errores?: string[];
  ayuda?: ReactNode;
  type?: React.HTMLInputTypeAttribute;
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
  className?: string;
} & Omit<
  React.ComponentProps<"input">,
  "id" | "name" | "type" | "defaultValue" | "placeholder" | "required" | "className"
>) {
  return (
    <Campo id={id} label={label} errores={errores} ayuda={ayuda} className={className}>
      <Input
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        required={required}
        {...propsControl(id, errores)}
        {...rest}
      />
    </Campo>
  );
}
