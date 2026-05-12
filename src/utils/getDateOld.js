function getDateParams() {

  const date = new Date();

  date.setDate(date.getDate() - 1);

  const truncated = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const dd = String(truncated.getDate()).padStart(2, '0');
  const mm = String(truncated.getMonth() + 1).padStart(2, '0');
  const yyyy = truncated.getFullYear();

  const base = `${dd}${mm}${yyyy}`;

  return {
    reportDate: truncated,
    fromDate: `${base}000000`,
    toDate: `${base}235959`
  };
}

module.exports = { getDateParams };