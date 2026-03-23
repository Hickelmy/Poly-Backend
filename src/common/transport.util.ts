/**
 * Auto-calcula o tipo de transporte baseado no peso total do pedido.
 *
 * Regras:
 * - Até 15kg  → moto
 * - Até 80kg  → carro
 * - Até 400kg → van
 * - Acima     → caminhao
 * - Sem peso definido → carro (default seguro)
 */
export function calculateTransportType(
  weightKg: number | null | undefined,
  quantity: number,
  unitType: string,
): string {
  let totalKg: number | null = null;

  if (unitType === 'kg') {
    totalKg = quantity;
  } else if (weightKg && weightKg > 0) {
    totalKg = quantity * weightKg;
  }

  if (totalKg === null) return 'carro';
  if (totalKg <= 15) return 'moto';
  if (totalKg <= 80) return 'carro';
  if (totalKg <= 400) return 'van';
  return 'caminhao';
}
