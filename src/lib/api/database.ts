import { API_BASE_URL, API_PUBLIC_KEY, getServiceKey } from "./config";
import { auth } from "./auth";

export class ApiError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type QueryResult<T> = { data: T | null; error: ApiError | null; count?: number | null };

class QueryBuilder<T = Record<string, unknown>> {
  private table: string;
  private serviceRole: boolean;
  private method: "GET" | "POST" | "PATCH" | "DELETE" = "GET";
  private filters: Record<string, string> = {};
  private selectColumns = "*";
  private orderSpec?: { column: string; ascending: boolean };
  private limitCount?: number;
  private offsetCount?: number;
  private searchQuery?: string;
  private wantCount = false;
  private payload?: unknown;
  private returnSingle: "none" | "single" | "maybeSingle" = "none";
  private returnRepresentation = false;

  constructor(table: string, serviceRole = false) {
    this.table = table;
    this.serviceRole = serviceRole;
  }

  select(columns: string) {
    this.selectColumns = columns;
    if (this.method === "POST") {
      this.returnRepresentation = true;
    }
    return this;
  }

  eq(column: string, value: string | number | boolean) {
    this.filters[column] = `eq.${value}`;
    return this;
  }

  in(column: string, values: Array<string | number>) {
    this.filters[column] = `in.(${values.join(",")})`;
    return this;
  }

  ilike(column: string, pattern: string) {
    this.filters[column] = `ilike.${pattern}`;
    return this;
  }

  gte(column: string, value: string | number) {
    this.filters[column] = `gte.${value}`;
    return this;
  }

  or(expression: string) {
    this.filters.or = expression;
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderSpec = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  offset(count: number) {
    this.offsetCount = count;
    return this;
  }

  search(query: string) {
    this.searchQuery = query.trim();
    return this;
  }

  count() {
    this.wantCount = true;
    return this;
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]) {
    this.method = "POST";
    this.payload = data;
    return this;
  }

  update(data: Record<string, unknown>) {
    this.method = "PATCH";
    this.payload = data;
    return this;
  }

  delete() {
    this.method = "DELETE";
    return this;
  }

  single() {
    this.returnSingle = "single";
    this.returnRepresentation = true;
    return this.run();
  }

  maybeSingle() {
    this.returnSingle = "maybeSingle";
    return this.run();
  }

  then<TResult1 = QueryResult<T | T[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T | T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<QueryResult<T | T[]>> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        apikey: this.serviceRole ? getServiceKey() : API_PUBLIC_KEY,
      };

      if (!this.serviceRole) {
        const { data: sessionData } = await auth.getSession();
        if (sessionData.session?.access_token) {
          headers.Authorization = `Bearer ${sessionData.session.access_token}`;
        }
      }

      const params = new URLSearchParams();
      if (this.method === "GET" || this.method === "PATCH" || this.method === "DELETE") {
        params.set("select", this.selectColumns);
      }
      for (const [key, value] of Object.entries(this.filters)) {
        params.set(key, value);
      }
      if (this.orderSpec) {
        params.set("order", `${this.orderSpec.column}.${this.orderSpec.ascending ? "asc" : "desc"}`);
      }
      if (this.searchQuery) {
        params.set("q", this.searchQuery);
      }
      if (this.returnSingle !== "none") {
        params.set("limit", "1");
      } else if (this.limitCount !== undefined) {
        params.set("limit", String(this.limitCount));
      }
      if (this.offsetCount !== undefined && this.returnSingle === "none") {
        params.set("offset", String(this.offsetCount));
      }

      const prefer: string[] = [];
      if (this.returnRepresentation) prefer.push("return=representation");
      if (this.returnSingle === "single") prefer.push("single");
      if (this.wantCount) prefer.push("count=exact");
      if (prefer.length) headers.Prefer = prefer.join(",");

      const qs = params.toString();
      const url = `${API_BASE_URL}/rest/v1/${this.table}${qs ? `?${qs}` : ""}`;

      const init: RequestInit = { method: this.method, headers };
      if (this.payload !== undefined && (this.method === "POST" || this.method === "PATCH")) {
        init.body = JSON.stringify(this.payload);
      }

      const response = await fetch(url, init);

      if (response.status === 204) {
        return { data: null, error: null };
      }

      const text = await response.text();
      let json: unknown = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }

      if (!response.ok) {
        const payload = json as { message?: string; error_description?: string; code?: string } | null;
        if (this.returnSingle === "maybeSingle" && (response.status === 406 || response.status === 404)) {
          return { data: null, error: null };
        }
        return {
          data: null,
          error: new ApiError(
            payload?.message || payload?.error_description || response.statusText,
            response.status,
            payload?.code,
          ),
        };
      }

      if (this.returnSingle === "maybeSingle") {
        if (Array.isArray(json) && json.length === 0) return { data: null, error: null, count: parseContentRange(response) };
        if (Array.isArray(json) && json.length === 1) {
          return { data: json[0] as T, error: null, count: parseContentRange(response) };
        }
      }

      return { data: json as T | T[], error: null, count: parseContentRange(response) };
    } catch (e) {
      return {
        data: null,
        error: new ApiError(e instanceof Error ? e.message : "Erro de rede"),
      };
    }
  }
}

export function from(table: string) {
  return new QueryBuilder(table, false);
}

export function fromService(table: string) {
  return new QueryBuilder(table, true);
}

function parseContentRange(response: Response): number | null {
  const header = response.headers.get("Content-Range");
  if (!header) return null;
  const match = header.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

export type { QueryResult };

export async function rpc<T = unknown>(
  name: string,
  params: Record<string, unknown>,
  serviceRole = false,
): Promise<QueryResult<T>> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: serviceRole ? getServiceKey() : API_PUBLIC_KEY,
    };

    if (!serviceRole) {
      const { data: sessionData } = await auth.getSession();
      if (sessionData.session?.access_token) {
        headers.Authorization = `Bearer ${sessionData.session.access_token}`;
      }
    }

    const response = await fetch(`${API_BASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });

    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
    }

    if (!response.ok) {
      const payload = json as { message?: string; error_description?: string; code?: string } | null;
      return {
        data: null,
        error: new ApiError(
          payload?.message || payload?.error_description || response.statusText,
          response.status,
          payload?.code,
        ),
      };
    }

    return { data: json as T, error: null };
  } catch (e) {
    return {
      data: null,
      error: new ApiError(e instanceof Error ? e.message : "Erro de rede"),
    };
  }
}
