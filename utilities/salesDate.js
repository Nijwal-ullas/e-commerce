export function getDateRange(type, start, end) {
  let startDate, endDate, groupFormat;

  const now = new Date();

  switch (type) {
    case "day":
      startDate = new Date(now.setHours(0,0,0,0));
      endDate = new Date();
      groupFormat = "%Y-%m-%d";
      break;

    case "week":
      const day = now.getDay(); 
      startDate = new Date(now);
      startDate.setDate(now.getDate() - day);
      startDate.setHours(0,0,0,0);
      endDate = new Date();
      groupFormat = "%Y-%m-%d";
      break;

    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date();
      groupFormat = "%Y-%m-%d";
      break;

    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date();
      groupFormat = "%Y-%m";
      break;

    case "custom":
      startDate = new Date(start);
      endDate = new Date(end);
      groupFormat = "%Y-%m-%d";
      break;
  }

  return { startDate, endDate, groupFormat };
}
