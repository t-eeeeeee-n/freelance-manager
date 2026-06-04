export function nextInvoiceNo(yearMonth: string, existingNos: string[]): string {
  const same = existingNos.filter(n => n.startsWith(yearMonth + '-'))
  const max = same.reduce((m, n) => {
    const seq = Number(n.slice(yearMonth.length + 1))
    return seq > m ? seq : m
  }, 0)
  return `${yearMonth}-${String(max + 1).padStart(3, '0')}`
}
