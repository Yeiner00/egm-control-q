import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const geminiChatCompletionsUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const getGeminiApiKey = () => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return apiKey;
};

const getGeminiTextModel = () =>
  Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-2.5-flash-lite";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const parseJsonObject = (content: string) => {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("La IA no devolvio JSON");
  return JSON.parse(match[0]);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const geminiApiKey = getGeminiApiKey();
    const geminiModel = getGeminiTextModel();

    const body = await req.json();
    const statisticPackage = body?.package;

    if (!isRecord(statisticPackage) || !Array.isArray(statisticPackage.reportes)) {
      return new Response(JSON.stringify({ error: "Paquete de estadistica invalido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reportsWithNovedades = statisticPackage.reportes.filter((report) =>
      isRecord(report) && typeof report.novedades === "string" && report.novedades.trim(),
    );

    if (reportsWithNovedades.length === 0) {
      return new Response(JSON.stringify({ data: { version: 1, celdas: [] } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Eres un analista de estadistica operativa de guardacostas.

Recibiras un paquete JSON con reportes de viaje, novedades libres, hojas de Excel ya resueltas y un catalogo de filas permitidas.

Tu tarea es extraer de las novedades solamente cantidades explicitas que correspondan a las filas_permitidas y devolverlas como celdas del Excel.

Reglas estrictas:
- Responde solo con JSON valido.
- Usa exactamente esta forma: {"version":1,"celdas":[{"hoja":"SNG-16","fecha":"2026-04-01","fila":108,"valor":2,"fuente":"Reporte 123"}]}.
- Usa solo reportes con hoja_excel. Si hoja_excel es null, ignora ese reporte.
- El campo hoja debe ser exactamente el valor de hoja_excel.
- El campo fecha debe ser la fecha del reporte donde aparece la novedad.
- El campo fila debe existir en filas_permitidas.
- El campo valor debe ser numerico positivo. No incluyas ceros.
- Cuenta datos escritos con numeros o con palabras claras, por ejemplo "dos embarcaciones" = 2.
- No inventes datos. Si una frase es ambigua, no la incluyas.
- Si varias novedades corresponden a la misma hoja, fecha y fila, puedes devolver varias celdas o una celda sumada.
- La fuente debe citar el numero de reporte y una referencia corta de la novedad.
- No extraigas horas hombre, kilometros, combustible, millas, motivos ni patrullajes estructurados; esos datos se calculan desde base de datos.
- No uses filas que no esten en filas_permitidas.`;

    const response = await fetch(geminiChatCompletionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${geminiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: geminiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Procesa este paquete de estadistica:\n\n${JSON.stringify(statisticPackage)}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_statistic_cells",
              description: "Devuelve celdas validas para completar el Excel de estadistica",
              parameters: {
                type: "object",
                properties: {
                  version: { type: "number", enum: [1] },
                  celdas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        hoja: { type: "string" },
                        fecha: { type: "string" },
                        fila: { type: "number" },
                        valor: { type: "number" },
                        fuente: { type: "string" },
                      },
                      required: ["hoja", "fecha", "fila", "valor", "fuente"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["version", "celdas"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_statistic_cells" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de solicitudes excedido." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Creditos insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const text = await response.text();
      console.error("Gemini API error:", response.status, text);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    const extractedData = toolCall?.function?.arguments
      ? JSON.parse(toolCall.function.arguments)
      : parseJsonObject(result.choices?.[0]?.message?.content || "");

    return new Response(JSON.stringify({ data: extractedData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-statistic-cells error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
