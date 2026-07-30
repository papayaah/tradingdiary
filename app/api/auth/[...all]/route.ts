import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

// Wrap the better-auth handlers so any 5xx (or thrown error) is logged with the
// path and response body. better-auth otherwise swallows internal errors and
// returns a bare 500 with no server log, making failures like the Google
// sign-in 500 impossible to diagnose.
async function logged(name: string, handler: (req: Request) => Promise<Response>, req: Request): Promise<Response> {
  try {
    const res = await handler(req);
    if (res.status >= 500) {
      const body = await res.clone().text().catch(() => "<unreadable>");
      console.error(`[auth] ${name} ${new URL(req.url).pathname} -> ${res.status}\n${body}`);
    }
    return res;
  } catch (err) {
    console.error(`[auth] ${name} ${new URL(req.url).pathname} threw:`, err);
    throw err;
  }
}

export const GET = (req: Request) => logged("GET", handlers.GET, req);
export const POST = (req: Request) => logged("POST", handlers.POST, req);
