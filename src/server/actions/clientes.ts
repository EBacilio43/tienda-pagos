"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import type { Rol } from "@/types/dominio";
import { esquemaCliente } from "@/lib/schemas/cliente";
import { Prisma } from "@prisma/client";
import { ErrorDominio } from "@/lib/errores";
import {
  crearCliente,
  actualizarCliente,
  eliminarCliente,
} from "@/server/services/clientes";
import { mensajeDeError } from "@/server/actions/manejar-error";

export type EstadoFormularioCliente = {
  mensaje?: string;
  errores?: Record<string, string[] | undefined>;
};

function datosDelFormulario(formData: FormData) {
  return {
    nombre: formData.get("nombre"),
    email: formData.get("email"),
    telefono: formData.get("telefono"),
    empresa: formData.get("empresa"),
    calle: formData.get("calle"),
    numExt: formData.get("numExt"),
    numInt: formData.get("numInt"),
    colonia: formData.get("colonia"),
    municipio: formData.get("municipio"),
    estado: formData.get("estado"),
    cp: formData.get("cp"),
  };
}

export async function crearClienteAction(
  _prevState: EstadoFormularioCliente,
  formData: FormData
): Promise<EstadoFormularioCliente> {
  const actor = await requireUser();

  const datos = esquemaCliente.safeParse(datosDelFormulario(formData));
  if (!datos.success) {
    return { errores: datos.error.flatten().fieldErrors };
  }

  let clienteId: number;
  try {
    const resultado = await crearCliente({ id: actor.id, rol: actor.rol as Rol }, datos.data);
    clienteId = resultado.id;
  } catch (err) {
    const errorTratado =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
        ? new ErrorDominio(`Ya existe un cliente con el nombre "${datos.data.nombre}"`)
        : err;
    return { mensaje: mensajeDeError(errorTratado, { accion: "crearCliente", actorId: actor.id }) };
  }

  revalidatePath("/clientes");
  redirect(`/clientes/${clienteId}`);
}

export async function actualizarClienteAction(
  id: number,
  _prevState: EstadoFormularioCliente,
  formData: FormData
): Promise<EstadoFormularioCliente> {
  const actor = await requireUser();

  const datos = esquemaCliente.safeParse(datosDelFormulario(formData));
  if (!datos.success) {
    return { errores: datos.error.flatten().fieldErrors };
  }

  try {
    await actualizarCliente({ id: actor.id, rol: actor.rol as Rol }, id, datos.data);
  } catch (err) {
    const errorTratado =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
        ? new ErrorDominio(`Ya existe un cliente con el nombre "${datos.data.nombre}"`)
        : err;
    return { mensaje: mensajeDeError(errorTratado, { accion: "actualizarCliente", actorId: actor.id, clienteId: id }) };
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  redirect(`/clientes/${id}`);
}

export async function eliminarClienteAction(id: number): Promise<{ mensaje?: string }> {
  const actor = await requireUser();

  try {
    await eliminarCliente({ id: actor.id, rol: actor.rol as Rol }, id);
  } catch (err) {
    return { mensaje: mensajeDeError(err, { accion: "eliminarCliente", actorId: actor.id, clienteId: id }) };
  }

  revalidatePath("/clientes");
  redirect("/clientes");
}
