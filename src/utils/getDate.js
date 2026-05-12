function getDateParams(n_day_in) {
  const date = new Date();

  date.setDate(date.getDate() - n_day_in);

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
    fromDate: base + '000000',
    toDate: base + '235959'
  };
}

function getMonthParams(year, month) {
  const fromDate = new Date(year, month - 1, 1, 0, 0, 0);
  const toDate = new Date(year, month, 0, 23, 59, 59);

  const ddFrom = String(fromDate.getDate()).padStart(2, '0');
  const mmFrom = String(fromDate.getMonth() + 1).padStart(2, '0');
  const yyyyFrom = fromDate.getFullYear();

  const ddTo = String(toDate.getDate()).padStart(2, '0');
  const mmTo = String(toDate.getMonth() + 1).padStart(2, '0');
  const yyyyTo = toDate.getFullYear();

  return {
    reportDate: toDate,
    fromDate: `${ddFrom}${mmFrom}${yyyyFrom}000000`,
    toDate: `${ddTo}${mmTo}${yyyyTo}235959`,
    monthName: getMonthName(month - 1),
    year: year
  };
}

function getLastMonthParams() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = lastMonth.getFullYear();
  const month = lastMonth.getMonth() + 1;
  
  return getMonthParams(year, month);
}

function getMonthName(monthIndex) {
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 
                  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  return months[monthIndex];
}

module.exports = { getDateParams, getMonthParams, getLastMonthParams };
