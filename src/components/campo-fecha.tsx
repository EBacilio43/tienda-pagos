"use client";

import { useEffect, useRef } from "react";
import { CampoTexto } from "@/components/campo";
import { hoyEnElNavegador } from "@/lib/fecha";

// Un <input type="date"> que propone HOY según el calendario de quien
// captura, no según UTC. Existe porque los tres formularios de dinero
// (pago, venta, devolución) hacían exactamente lo mismo y exactamente mal.
//
// Por qué no basta con `defaultValue={hoyEnElNavegador()}`, que es el
// arreglo que parece obvio: un Client Component también se renderiza en el
// SERVIDOR, y ahí `hoyEnElNavegador()` devuelve la fecha del contenedor,
// que corre en UTC. Como el input es NO controlado, React conserva al
// hidratar el valor que vino en el HTML del servidor y nunca lo corrige.
// Medido en un navegador real con zona `America/Mexico_City` a las 22:20
// del 1 de septiembre: con el cambio de una línea ya aplicado, los tres
// formularios seguían proponiendo `2026-09-02`. El arreglo se ve hecho en
// el diff y no arregla nada — por eso el valor se fija después de montar.
//
// Se fija solo si el input está vacío: así una pantalla de edición conserva
// la fecha guardada del registro, y nunca se pisa lo que la persona ya
// escribió si el efecto llegara tarde.
export function CampoFecha({
  id = "fecha",
  label = "Fecha",
  defaultValue,
  required,
  errores,
}: {
  id?: string;
  label?: string;
  defaultValue?: string;
  required?: boolean;
  errores?: string[];
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = ref.current;
    if (input && !input.value) {
      input.value = hoyEnElNavegador();
    }
  }, []);

  return (
    <CampoTexto
      ref={ref}
      id={id}
      label={label}
      type="date"
      defaultValue={defaultValue}
      required={required}
      errores={errores}
    />
  );
}
