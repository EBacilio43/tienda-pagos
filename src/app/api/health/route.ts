import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);
}

export async function GET() {
  try {
    await conTimeout(prisma.$queryRaw`SELECT 1`, 2000);
    return NextResponse.json({ ok: true, db: "up" });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
