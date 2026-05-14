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
  Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-2.5-flash-lite";

interface VehicleMotiveCounts {
  controlNarcotrafico: number;
  controlMigracionIlegal: number;
  seguridadCiudadana: number;
  proteccionBanistas: number;
  pescaIlegal: number;
}

const toSafeCount = (value: unknown) => {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : 0;
};

const normalizeVehicleMotiveCounts = (raw: unknown): VehicleMotiveCounts | null => {
  if (!raw || typeof raw !== "object") return null;

  const counts = raw as Record<string, unknown>;

  return {
    controlNarcotrafico: toSafeCount(counts.controlNarcotrafico),
    controlMigracionIlegal: toSafeCount(counts.controlMigracionIlegal),
    seguridadCiudadana: toSafeCount(counts.seguridadCiudadana),
    proteccionBanistas: toSafeCount(counts.proteccionBanistas),
    pescaIlegal: toSafeCount(counts.pescaIlegal),
  };
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const replaceSummaryLine = (summary: string, label: string, count: number) => {
  const pattern = new RegExp(`(^${escapeRegExp(label)}:\\s*)[^\\r\\n]*`, "m");
  return summary.replace(pattern, (_match, prefix) => `${prefix}${count}`);
};

const enforceVehicleMotiveCounts = (summary: string, counts: VehicleMotiveCounts | null) => {
  if (!counts) return summary;

  return [
    ["Control de narcotráfico", counts.controlNarcotrafico],
    ["Control migración ilegal", counts.controlMigracionIlegal],
    ["Seguridad ciudadana", counts.seguridadCiudadana],
    ["Protección de bañistas", counts.proteccionBanistas],
    ["Pesca ilegal", counts.pescaIlegal],
  ].reduce((nextSummary, [label, count]) =>
    replaceSummaryLine(nextSummary, String(label), Number(count)), summary);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const geminiApiKey = getGeminiApiKey();
    const geminiModel = getGeminiTextModel();

    const { novedades, persona, tipo, reportNumbers, totalKm, embarcaciones, totalMillas, vehicleMotiveCounts: rawVehicleMotiveCounts } = await req.json();
    if (!novedades || !Array.isArray(novedades) || novedades.length === 0) {
      return new Response(JSON.stringify({ summary: "No hay novedades para resumir.", activities: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = novedades.filter(Boolean).join("\n---\n");
    const totalReportes = novedades.length;
    const isBoat = tipo === "embarcacion";
    const vehicleMotiveCounts = normalizeVehicleMotiveCounts(rawVehicleMotiveCounts);
    const vehicleMotiveCountValue = (key: keyof VehicleMotiveCounts) =>
      vehicleMotiveCounts ? String(vehicleMotiveCounts[key]) : "[dato]";

    let systemPrompt = "";

    if (isBoat) {
      systemPrompt = `Eres un analista de operaciones de guardacostas. Se te proporcionarán novedades de reportes de patrullajes marítimos/fluviales de guardacostas.

Tu tarea es generar un resumen operativo en JSON:

Ademas, identifica actividades relevantes que no esten cubiertas por los campos de la plantilla. Solo incluyelas si aparecen explicitamente en las novedades y tienen una accion, cantidad o resultado claro. Integra esas actividades en una sola frase breve dentro del resumen, antes de "Por lo anterior expuesto...". No inventes datos, no repitas actividades ya incluidas en los campos anteriores y omite la frase extra si no hay informacion nueva.

1. RESUMEN: Genera un texto que siga EXACTAMENTE esta plantilla, rellenando los datos que encuentres en las novedades. Los datos entre corchetes deben reemplazarse con los valores reales extraídos. Si un dato no se encuentra en las novedades, déjalo en blanco. IMPORTANTE: Los conteos deben ser la SUMA TOTAL de todos los reportes, no solo el conteo de reportes donde aparecen.

Las embarcaciones son: ${embarcaciones || "[no especificadas]"}
Los números de reporte son: ${reportNumbers || "[no especificados]"}
Las millas totales son: ${totalMillas || 0}

Plantilla:
"Durante las fechas indicadas y los patrullajes realizados en las embarcaciones ${embarcaciones || "[embarcaciones]"}, según los reportes de viaje ${reportNumbers || "[reportes]"} se recorrieron ${totalMillas || "[millas]"} millas náuticas de patrullajes en aguas de la jurisdicción de la Estación, logrando como resultados positivos en el alcance de las metas de la Estación de los objetivos operativos del PAO 2026, que se describen a continuación:

Patrullajes marítimos:
Embarcaciones inspeccionadas: [dato]
Acciones de patrullaje sobre crimen organizado y delitos conexos: [dato]
Acciones de patrullaje tipo ambiental: [dato]
Porcentaje de mar territorial patrullado: 
Prevenciones: [dato]
Acciones de protección a bañistas: [dato]
Cantidad de Archivo Policial realizadas: [dato]
Decomisos: [dato]
Hallazgos: [dato]
Personas detenidas: [dato]
Se realizaron [dato] inspecciones a embarcación las cuales cumplían con los requisitos de navegabilidad, certificado de pesca.
Se realizaron [dato] inspecciones por archivo policial.
Se realizó [dato] personas detenidas por piratería de nacionalidad nicaragüense.
Se realizaron [dato] prevenciones por las distintas playas de la zona, brindando seguridad de playas.
[Si hay actividades relevantes fuera de los campos anteriores, agrega aqui una sola frase breve con esas acciones y cantidades explicitas. Si no hay, omite esta linea.]

Por lo anterior expuesto, se incide en las actividades de planificación de la evaluación de Desempeño 2026, el número: "

ACTIVIDADES: No generes una lista separada; integra cualquier actividad adicional relevante dentro del resumen y deja "activities" como [].

Responde EXACTAMENTE en este formato JSON (sin texto adicional):
{
  "summary": "El texto del resumen con la plantilla completada",
  "activities": []
}

La propiedad "activities" se mantiene solo por compatibilidad y siempre debe ser un arreglo vacio. Responde en español.`;
    } else {
      systemPrompt = `Eres un analista de operaciones de guardacostas. Se te proporcionarán novedades de reportes de patrullajes terrestres costeros en vehículos de guardacostas.

Tu tarea es generar un resumen operativo en JSON:

Ademas, identifica actividades relevantes que no esten cubiertas por los campos de la plantilla. Solo incluyelas si aparecen explicitamente en las novedades y tienen una accion, cantidad o resultado claro. Integra esas actividades en una sola frase breve dentro del resumen, despues de los hechos principales. No inventes datos, no repitas actividades ya incluidas en los campos anteriores y omite la frase extra si no hay informacion nueva.

1. RESUMEN: Genera un texto que siga EXACTAMENTE esta plantilla, rellenando los datos que encuentres en las novedades. IMPORTANTE: Los conteos deben ser la SUMA TOTAL de todos los reportes combinados, no solo el conteo de reportes donde aparecen.

Los números de reporte son: ${reportNumbers || "[no especificados]"}
Los kilómetros totales son: ${totalKm || 0}
${vehicleMotiveCounts ? `Conteos estructurados desde motivos, ya calculados por cantidad de reportes: Control de narcotráfico ${vehicleMotiveCounts.controlNarcotrafico}, Control migración ilegal ${vehicleMotiveCounts.controlMigracionIlegal}, Seguridad ciudadana ${vehicleMotiveCounts.seguridadCiudadana}, Protección de bañistas ${vehicleMotiveCounts.proteccionBanistas}, Pesca ilegal ${vehicleMotiveCounts.pescaIlegal}. Usa estos valores exactos y no los deduzcas desde novedades.` : ""}

Plantilla:
"Durante las fechas indicadas por la labor realizada en los patrullajes según los siguientes reportes de viaje: ${reportNumbers || "[reportes]"} recorridos por los sectores norte y sur de la jurisdicción de la Estación, incidiendo en las acciones operativas de patrullaje como: Seguridad ciudadana; control de actividades ilícitas que pueden afectar el sano convivio de las personas en las comunidades y sitios visitados. Protección de bañistas; seguridad, información, prevención a las personas que hacen uso de los sitios turísticos como las playas 4x4, playa Rajada, playa Soley, Papaturro, Eco playa, Las Nubes, Manzanillo, Rajadita, Coyotera, Coquito, El Jobo el pueblo de Cuajiniquil, sectores de Agua Calientes, pista aterrizaje Murciélago entre otros. Pesca ilegal; vigilancia por actividades que vayan contra lo dictado en la Ley de Pesca y Acuicultura, específicamente en sectores de playas, ríos, desembocaduras y áreas de recibidores en comunidades pesqueras. Narcotráfico y contrabando; vigilancia y control en zonas propensas del área de jurisdicción de la Estación.

Hechos:
Kilómetros recorridos: realizando un total de recorridos de ${totalKm || "[km]"} km
Acciones de patrullaje realizadas: [dato]
Control de narcotráfico: ${vehicleMotiveCountValue("controlNarcotrafico")}
Control migración ilegal: ${vehicleMotiveCountValue("controlMigracionIlegal")}
Prevenciones: [dato]
Seguridad ciudadana: ${vehicleMotiveCountValue("seguridadCiudadana")}
Protección de bañistas: ${vehicleMotiveCountValue("proteccionBanistas")}
Pesca ilegal: ${vehicleMotiveCountValue("pescaIlegal")}
Otros: [dato si existe en novedades]
Puestos de controles vehiculares: [dato si existe en novedades]
[Si hay actividades relevantes fuera de los campos anteriores, agrega aqui una sola frase breve con esas acciones y cantidades explicitas. Si no hay, omite esta linea.]"

ACTIVIDADES: No generes una lista separada; integra cualquier actividad adicional relevante dentro del resumen y deja "activities" como [].

Responde EXACTAMENTE en este formato JSON (sin texto adicional):
{
  "summary": "El texto del resumen con la plantilla completada",
  "activities": []
}

La propiedad "activities" se mantiene solo por compatibilidad y siempre debe ser un arreglo vacio. Responde en español.`;
    }

    systemPrompt += `

Instruccion final obligatoria:
- El resumen es la salida principal. No generes una lista separada de actividades destacadas.
- Mantiene "activities" como [] siempre; esa propiedad existe solo por compatibilidad tecnica.
- Si encuentras una actividad importante que no aparece en la plantilla, integrala dentro de "summary" en una sola frase breve.
- Solo agrega esa frase si la actividad esta explicitamente en las novedades y tiene una accion, cantidad o resultado claro.
- No inventes cantidades, no agregues datos vagos y no repitas acciones ya cubiertas por los campos de la plantilla.`;

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
          { role: "user", content: `Novedades (${totalReportes} reportes):\n${text}` },
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
      throw new Error(`AI error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return new Response(JSON.stringify({
          summary: enforceVehicleMotiveCounts(parsed.summary || "No se pudo generar resumen.", isBoat ? null : vehicleMotiveCounts),
          activities: [],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch {
      // fallback
    }

    return new Response(JSON.stringify({
      summary: enforceVehicleMotiveCounts(content || "No se pudo generar resumen.", isBoat ? null : vehicleMotiveCounts),
      activities: [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("summarize error:", error);
    return new Response(
      JSON.stringify({ summary: "Error al generar resumen.", activities: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
