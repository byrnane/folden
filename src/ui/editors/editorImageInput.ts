export function imageFileFromTransfer(transfer: DataTransfer | null) {
  return Array.from(transfer?.files ?? []).find((file) => file.type.startsWith('image/')) ?? null
}
