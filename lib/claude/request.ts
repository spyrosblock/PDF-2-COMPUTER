// Reading the JSON body of the routes under app/api.
//
// All of them take a small JSON object and answer with one, and all of them have
// the same two ways of being called wrongly — a body that isn't JSON, and a
// missing field. Keeping that here leaves each route as the step it runs.

export type Body = Record<string, unknown>;

// The request's JSON body, or null if it hadn't one.
export async function jsonBody(request: Request): Promise<Body | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Body) : null;
  } catch {
    return null;
  }
}

// A required non-empty string field, or null if it is missing or empty.
export function requiredString(body: Body, name: string): string | null {
  const value = body[name];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

// An optional string field — absent, or of the wrong type, both read as null.
export function optionalString(body: Body, name: string): string | null {
  const value = body[name];
  return typeof value === "string" && value !== "" ? value : null;
}

// An optional array-of-strings field, for the instruction lines a figure request
// carries. Anything that isn't a string is dropped rather than rejected.
export function stringList(body: Body, name: string): string[] {
  const value = body[name];
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

// What a step's failure looks like to the caller. The message is the upstream's
// where there is one, since that is what tells a developer which call broke.
export function upstreamFailure(err: unknown, context: string): Response {
  console.error(`${context} failed:`, err);
  return Response.json(
    { error: err instanceof Error ? err.message : "Extraction failed." },
    { status: 502 },
  );
}
