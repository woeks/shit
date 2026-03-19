type DateLike = string | number | Date | null | undefined;

const pad = (value: number) => String(value).padStart(2, '0');

export const formatDateTime = (value: DateLike) => {
  if (!value) {
    return '-';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

export const formatDateCell = (_row: unknown, _column: unknown, value: DateLike) => formatDateTime(value);
