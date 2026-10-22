/** Límite total de adjuntos por envío a Rafa (la IA rechaza o corta envíos más pesados). */
export const LIMITE_ADJUNTOS_MB = 8;

/** Devuelve un mensaje de error si los archivos superan el límite; null si están bien. */
export function validarPesoAdjuntos(archivos: Blob[]): string | null {
  const total = archivos.reduce((s, f) => s + f.size, 0);
  if (total <= LIMITE_ADJUNTOS_MB * 1024 * 1024) return null;
  const mb = (total / 1024 / 1024).toFixed(1);
  return `Los archivos pesan ${mb} MB y el máximo es ${LIMITE_ADJUNTOS_MB} MB. Divide el PDF en partes (por ejemplo por manzana) o comprímelo, y envíalos por separado.`;
}

/** Convierte un archivo o audio a base64 sin el prefijo data:… (formato que espera rafa-asistente). */
export function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
