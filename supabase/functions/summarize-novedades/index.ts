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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const geminiApiKey = getGeminiApiKey();
    const geminiModel = getGeminiTextModel();

    const { novedades, persona, tipo, reportNumbers, totalKm, embarcaciones, totalMillas } = await req.json();
    if (!novedades || !Array.isArray(novedades) || novedades.length === 0) {
      return new Response(JSON.stringify({ summary: "No hay novedades para resumir.", activities: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = novedades.filter(Boolean).join("\n---\n");
    const totalReportes = novedades.length;
    const isBoat = tipo === "embarcacion";

    let systemPrompt = "";

    if (isBoat) {
      systemPrompt = `Eres un analista de operaciones de guardacostas. Se te proporcionarán novedades de reportes de patrullajes marítimos/fluviales de guardacostas.

Tu tarea es doble:

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

Por lo anterior expuesto, se incide en las actividades de planificación de la evaluación de Desempeño 2026, el número: "

2. ACTIVIDADES: Analiza TODOS los reportes. Cuenta la SUMA TOTAL de cada actividad en TODOS los reportes combinados (no en cuántos reportes aparece, sino la cantidad total). Ejemplo: si un reporte tiene "12 prevenciones" y otro tiene "8 prevenciones", el total es 20. Ordena de mayor a menor.

Responde EXACTAMENTE en este formato JSON (sin texto adicional):
{
  "summary": "El texto del resumen con la plantilla completada",
  "activities": [
    {"activity": "🛡️ Prevenciones", "count": 20},
    {"activity": "🚢 Embarcaciones inspeccionadas", "count": 5}
  ]
}

Incluye un emoji relevante antes de cada actividad. Responde en español.`;
    } else {
      systemPrompt = `Eres un analista de operaciones de guardacostas. Se te proporcionarán novedades de reportes de patrullajes terrestres costeros en vehículos de guardacostas.

Tu tarea es doble:

1. RESUMEN: Genera un texto que siga EXACTAMENTE esta plantilla, rellenando los datos que encuentres en las novedades. IMPORTANTE: Los conteos deben ser la SUMA TOTAL de todos los reportes combinados, no solo el conteo de reportes donde aparecen.

Los números de reporte son: ${reportNumbers || "[no especificados]"}
Los kilómetros totales son: ${totalKm || 0}

Plantilla:
"Durante las fechas indicadas por la labor realizada en los patrullajes según los siguientes reportes de viaje: ${reportNumbers || "[reportes]"} recorridos por los sectores norte y sur de la jurisdicción de la Estación, incidiendo en las acciones operativas de patrullaje como: Seguridad ciudadana; control de actividades ilícitas que pueden afectar el sano convivio de las personas en las comunidades y sitios visitados. Protección de bañistas; seguridad, información, prevención a las personas que hacen uso de los sitios turísticos como las playas 4x4, playa Rajada, playa Soley, Papaturro, Eco playa, Las Nubes, Manzanillo, Rajadita, Coyotera, Coquito, El Jobo el pueblo de Cuajiniquil, sectores de Agua Calientes, pista aterrizaje Murciélago entre otros. Pesca ilegal; vigilancia por actividades que vayan contra lo dictado en la Ley de Pesca y Acuicultura, específicamente en sectores de playas, ríos, desembocaduras y áreas de recibidores en comunidades pesqueras. Narcotráfico y contrabando; vigilancia y control en zonas propensas del área de jurisdicción de la Estación.

Hechos:
Kilómetros recorridos: realizando un total de recorridos de ${totalKm || "[km]"} km
Acciones de patrullaje realizadas: [dato]
Control de narcotráfico: [dato]
Control migración ilegal: [dato]
Prevenciones: [dato]
Seguridad ciudadana: [dato]
Protección de bañistas: [dato]
Pesca ilegal: [dato]
Otros: [dato si existe en novedades]
Puestos de controles vehiculares: [dato si existe en novedades]"

2. ACTIVIDADES: Analiza TODOS los reportes. Cuenta la SUMA TOTAL de cada actividad en TODOS los reportes combinados (no en cuántos reportes aparece, sino la cantidad total). Ejemplo: si un reporte tiene "12 prevenciones" y otro tiene "8 prevenciones", el total es 20. Ordena de mayor a menor.

Responde EXACTAMENTE en este formato JSON (sin texto adicional):
{
  "summary": "El texto del resumen con la plantilla completada",
  "activities": [
    {"activity": "🛡️ Prevenciones", "count": 20},
    {"activity": "🚗 Controles vehiculares", "count": 5}
  ]
}

Incluye un emoji relevante antes de cada actividad. Responde en español.`;
    }

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
      if (response.status === 429 || response.status === 402) {
        return new Response(JSON.stringify({ summary: "No se pudo generar el resumen (límite de uso).", activities: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
          summary: parsed.summary || "No se pudo generar resumen.",
          activities: parsed.activities || [],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch {
      // fallback
    }

    return new Response(JSON.stringify({ summary: content || "No se pudo generar resumen.", activities: [] }), {
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
