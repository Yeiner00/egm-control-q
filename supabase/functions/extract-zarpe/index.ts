import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const formData = await req.formData();
    const file = formData.get("image") as File;
    if (!file) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (file.size > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Image exceeds 10MB limit" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    // Encode in chunks to avoid call stack overflow on large files
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);
    const mimeType = file.type || "image/jpeg";

    const systemPrompt = `Eres un extractor de datos de documentos de zarpe del MOPT de Costa Rica. 
Analiza la imagen del documento de zarpe y extrae los siguientes campos exactamente:

- nombre_embarcacion: buscar después de "la embarcación" o "embarcación"
- matricula: buscar después de "Matrícula" 
- nombre_capitan: buscar después de "al mando del Capitán" o "Capitán"
- cedula_capitan: buscar después de "número de cédula" o "cédula"
- zarpe_folio: buscar el campo "Folio" (generalmente en la esquina superior derecha)
- fecha_viaje: buscar después de "realice un viaje el" (formato DD/MM/YYYY)
- destino: buscar después de "con destino"
- num_tripulantes: contar las filas en la tabla de tripulación y sumar 1 (por el capitán)
- hora_salida: buscar en "Fecha y hora estimada de salida" (extraer solo HH:MM en formato 24h)
- fecha_regreso: buscar en "Fecha y hora estimada de regreso" (extraer solo la fecha DD/MM/YYYY)

Responde ÚNICAMENTE con un JSON válido con estos campos. Si no puedes extraer un campo, usa null.
No incluyas explicaciones, solo el JSON.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
              {
                type: "text",
                text: "Extrae todos los datos del zarpe de esta imagen. Responde solo con JSON.",
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_zarpe_data",
              description: "Extract zarpe document data from a Costa Rican MOPT maritime departure document",
              parameters: {
                type: "object",
                properties: {
                  nombre_embarcacion: { type: "string", description: "Nombre de la embarcación" },
                  matricula: { type: "string", description: "Matrícula de la embarcación" },
                  nombre_capitan: { type: "string", description: "Nombre del capitán" },
                  cedula_capitan: { type: "string", description: "Cédula del capitán" },
                  zarpe_folio: { type: "string", description: "Número de folio del zarpe" },
                  fecha_viaje: { type: "string", description: "Fecha del viaje DD/MM/YYYY" },
                  destino: { type: "string", description: "Destino del viaje" },
                  num_tripulantes: { type: "number", description: "Número de tripulantes incluyendo capitán" },
                  hora_salida: { type: "string", description: "Hora de salida HH:MM" },
                  fecha_regreso: { type: "string", description: "Fecha de regreso DD/MM/YYYY" },
                },
                required: [
                  "nombre_embarcacion", "matricula", "nombre_capitan", "cedula_capitan",
                  "zarpe_folio", "fecha_viaje", "destino", "num_tripulantes",
                  "hora_salida", "fecha_regreso"
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_zarpe_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Límite de solicitudes excedido. Intenta más tarde." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Agrega fondos en la configuración." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    
    let extractedData;
    if (toolCall?.function?.arguments) {
      extractedData = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: try parsing content as JSON
      const content = result.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not extract data from AI response");
      }
    }

    return new Response(JSON.stringify({ data: extractedData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-zarpe error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
