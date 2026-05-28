import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const geminiChatCompletionsUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const getRetryAfterMs = (response: Response) => {
  const retryAfter = response.headers.get("Retry-After");
  if (!retryAfter) return 15000;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);

  const retryDate = Date.parse(retryAfter);
  if (Number.isFinite(retryDate)) return Math.max(1000, retryDate - Date.now());

  return 15000;
};

const aiRateLimitResponse = (response: Response) =>
  new Response(JSON.stringify({
    error: "Se alcanzó el límite temporal de IA. Intente continuar en unos minutos.",
    code: "AI_RATE_LIMITED",
    retryAfterMs: getRetryAfterMs(response),
    retryable: true,
  }), {
    status: 429,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const aiCreditsResponse = () =>
  new Response(JSON.stringify({
    error: "Créditos insuficientes para usar IA.",
    code: "AI_CREDITS_REQUIRED",
    retryable: false,
  }), {
    status: 402,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getGeminiApiKey = () => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return apiKey;
};

const getGeminiTextModel = () =>
  Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-3.1-flash-lite";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const geminiApiKey = getGeminiApiKey();
    const geminiModel = getGeminiTextModel();

    const { content } = await req.json();
    if (!content || typeof content !== "string") {
      return new Response(JSON.stringify({ error: "No content provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Eres un extractor de datos de reportes de la estacion de guardacostas de Costa Rica.
Recibiras el contenido de un archivo Excel como texto. Tu tarea:

1. Detectar el tipo de reporte: "vehiculo" o "embarcacion".
2. Extraer los campos segun el tipo detectado.

Para VEHICULO extraer:
- no_reporte (string), bitacora (string), fecha (YYYY-MM-DD), hora_salida (HH:MM), hora_regreso (HH:MM)
- estacion, vehiculo, destino
- motivos (array de strings, cada motivo individual)
- chofer, chofer_cedula
- acompanantes (array de strings)
- oficial_a_cargo, oficial_a_cargo_cedula
- sitios_visitados (array de {nombre_sitio, zona, posicion})
- estacion_combustible, lugar_combustible, cedula_juridica_combustible, no_factura
- combustible_trasegado_bomba, total_combustible_antes_viaje, combustible_gastado, saldo_combustible_despues_viaje, kilometros_recorridos
- novedades

Para EMBARCACION extraer:
- no_reporte (string), bitacora (string), folios (string), fecha (YYYY-MM-DD), estacion
- embarcacion, no_cierre_os
- hora_salida, hora_regreso, horas_motor_babor, horas_motor_centro, horas_motor_estribor
- destino, motivos (array de strings, cada motivo individual)
- capitan, capitan_cedula
- encargado_mision, encargado_mision_cedula
- oficial_director, oficial_director_cedula
- operacional, operacional_cedula
- tripulantes (array de {nombre, cedula})
- personas_particulares (array de strings)
- sitios_visitados (array de {nombre_sitio, zona, posicion})
- embarcaciones_inspeccionadas (array de {nombre, matricula, no_inspeccion, zona})
- saldo_anterior, combustible_trasegado_bodega, total_antes_viaje, combustible_trasegado_durante, combustible_gastado, saldo_despues
- tipo_combustible, estacion_combustible, lugar_combustible, cedula_juridica_combustible, no_factura, millas_nauticas
- novedades

Si no puedes leer un campo, usa null.
El campo no_reporte debe ser solo el numero base del reporte, sin ano pegado. Ejemplo: si lees "841-2026", devuelve "841"; si lees "012", devuelve "012".
Para motivos, prefiere nombres limpios y consistentes como: Control migratorio, Control de narcotrafico, Pesca ilegal, Seguridad ciudadana, Proteccion a banistas, Control de contrabando, Reafirmacion de soberania, Pirateria, Caceria ilegal, Seguridad ambiental, Operativo Verano Seguro, Operativo Semana Santa, Proteccion de bosques, Alteracion de humedales, Inspeccion de embarcacion o Apoyo operativo.
Responde SOLO con JSON.`;

    const personSchema = {
      type: "object",
      properties: {
        nombre: { type: "string" },
        cedula: { type: "string" },
      },
    };
    const siteSchema = {
      type: "object",
      properties: {
        nombre_sitio: { type: "string" },
        zona: { type: "string" },
        posicion: { type: "string" },
      },
    };

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
          { role: "user", content: `Extrae los datos de este reporte:\n\n${content}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_vehicle_report",
              description: "Extract vehicle trip report data",
              parameters: {
                type: "object",
                properties: {
                  tipo: { type: "string", enum: ["vehiculo"] },
                  no_reporte: { type: "string" },
                  bitacora: { type: "string" },
                  fecha: { type: "string" },
                  hora_salida: { type: "string" },
                  hora_regreso: { type: "string" },
                  estacion: { type: "string" },
                  vehiculo: { type: "string" },
                  destino: { type: "string" },
                  motivos: { type: "array", items: { type: "string" } },
                  chofer: { type: "string" },
                  chofer_cedula: { type: "string" },
                  acompanantes: { type: "array", items: { type: "string" } },
                  oficial_a_cargo: { type: "string" },
                  oficial_a_cargo_cedula: { type: "string" },
                  sitios_visitados: { type: "array", items: siteSchema },
                  estacion_combustible: { type: "string" },
                  lugar_combustible: { type: "string" },
                  cedula_juridica_combustible: { type: "string" },
                  no_factura: { type: "string" },
                  combustible_trasegado_bomba: { type: "number" },
                  total_combustible_antes_viaje: { type: "number" },
                  combustible_gastado: { type: "number" },
                  saldo_combustible_despues_viaje: { type: "number" },
                  kilometros_recorridos: { type: "number" },
                  novedades: { type: "string" },
                },
                required: ["tipo", "no_reporte"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "extract_boat_report",
              description: "Extract boat report data",
              parameters: {
                type: "object",
                properties: {
                  tipo: { type: "string", enum: ["embarcacion"] },
                  no_reporte: { type: "string" },
                  bitacora: { type: "string" },
                  folios: { type: "string" },
                  fecha: { type: "string" },
                  estacion: { type: "string" },
                  embarcacion: { type: "string" },
                  no_cierre_os: { type: "string" },
                  hora_salida: { type: "string" },
                  hora_regreso: { type: "string" },
                  horas_motor_babor: { type: "number" },
                  horas_motor_centro: { type: "number" },
                  horas_motor_estribor: { type: "number" },
                  destino: { type: "string" },
                  motivos: { type: "array", items: { type: "string" } },
                  capitan: { type: "string" },
                  capitan_cedula: { type: "string" },
                  encargado_mision: { type: "string" },
                  encargado_mision_cedula: { type: "string" },
                  oficial_director: { type: "string" },
                  oficial_director_cedula: { type: "string" },
                  operacional: { type: "string" },
                  operacional_cedula: { type: "string" },
                  tripulantes: { type: "array", items: personSchema },
                  personas_particulares: { type: "array", items: { type: "string" } },
                  sitios_visitados: { type: "array", items: siteSchema },
                  embarcaciones_inspeccionadas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        nombre: { type: "string" },
                        matricula: { type: "string" },
                        no_inspeccion: { type: "string" },
                        zona: { type: "string" },
                      },
                    },
                  },
                  saldo_anterior: { type: "number" },
                  combustible_trasegado_bodega: { type: "number" },
                  total_antes_viaje: { type: "number" },
                  combustible_trasegado_durante: { type: "number" },
                  combustible_gastado: { type: "number" },
                  saldo_despues: { type: "number" },
                  tipo_combustible: { type: "string" },
                  estacion_combustible: { type: "string" },
                  lugar_combustible: { type: "string" },
                  cedula_juridica_combustible: { type: "string" },
                  no_factura: { type: "string" },
                  millas_nauticas: { type: "number" },
                  novedades: { type: "string" },
                },
                required: ["tipo", "no_reporte"],
              },
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return aiRateLimitResponse(response);
      }
      if (response.status === 402) {
        return aiCreditsResponse();
      }
      const text = await response.text();
      console.error("Gemini API error:", response.status, text);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    let extractedData;
    if (toolCall?.function?.arguments) {
      extractedData = JSON.parse(toolCall.function.arguments);
    } else {
      const content2 = result.choices?.[0]?.message?.content || "";
      const match = content2.match(/\{[\s\S]*\}/);
      if (match) extractedData = JSON.parse(match[0]);
      else throw new Error("No se pudo extraer datos");
    }

    return new Response(JSON.stringify({ data: extractedData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-report error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
