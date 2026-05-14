const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status });

export default {
  async fetch(request: Request) {
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return jsonResponse({ ok: false, error: "Missing CRON_SECRET" }, 500);
    }

    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ ok: false, error: "Missing Supabase environment variables" }, 500);
    }

    const rpcUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/keepalive`;
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: "{}",
    });

    if (!response.ok) {
      return jsonResponse(
        {
          ok: false,
          error: "Supabase keepalive failed",
          status: response.status,
        },
        502
      );
    }

    const data = await response.json();
    return jsonResponse({ ok: true, data });
  },
};
