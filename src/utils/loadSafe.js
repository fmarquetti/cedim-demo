export async function loadSafe(label, promise, fallback) {
  const [result] = await Promise.allSettled([promise]);

  if (result.status === "fulfilled") {
    return {
      data: result.value ?? fallback,
      error: null,
    };
  }

  console.error(`Error cargando ${label}:`, result.reason);

  return {
    data: fallback,
    error: result.reason,
  };
}

export async function loadSafeBatch(loaders) {
  const entries = Object.entries(loaders);
  const settled = await Promise.allSettled(entries.map(([, loader]) => loader.promise));

  return Object.fromEntries(
    settled.map((result, index) => {
      const [key, loader] = entries[index];

      if (result.status === "fulfilled") {
        return [
          key,
          {
            data: result.value ?? loader.fallback,
            error: null,
          },
        ];
      }

      console.error(`Error cargando ${loader.label}:`, result.reason);

      return [
        key,
        {
          data: loader.fallback,
          error: result.reason,
        },
      ];
    })
  );
}

export function notifyLoadErrors(results, notify) {
  Object.entries(results).forEach(([label, result]) => {
    if (!result?.error) return;
    const message = result.error?.message || "Error desconocido";
    notify(`No se pudo cargar ${label}: ${message}`);
  });
}
