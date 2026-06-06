const assertUrl = (value: string, label: string): URL => {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} no es una URL valida: ${value}`);
  }
};

export const assertAllowedFetchUrl = (target: string, allowedOrigin: string) => {
  const targetUrl = assertUrl(target, "URL de destino");
  const allowedUrl = assertUrl(allowedOrigin, "Origen permitido");
  if (targetUrl.host !== allowedUrl.host || targetUrl.protocol !== allowedUrl.protocol) {
    throw new Error(
      `Fetch bloqueado: el origen ${targetUrl.origin} no coincide con el origen permitido ${allowedUrl.origin}`,
    );
  }
};
