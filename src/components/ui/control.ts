// Fase 9 / ADR-17 / P15. Fuente única de la clase base de un control de
// formulario. `input.tsx` y `select.tsx` la importan — así no pueden
// divergir por construcción.
// En móvil: h-11 (44px) para área táctil mínima ergonómica y text-base (16px)
// para evitar el zoom involuntario de iOS al enfocar. En desktop: sm:h-8 y
// sm:text-sm.
export const claseControl =
  "h-11 sm:h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 sm:px-2.5 py-1 text-base sm:text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";

