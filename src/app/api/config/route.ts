import { configStatus } from "@/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(configStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
