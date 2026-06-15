import ExcelJS from "exceljs";

interface SailedBookingRow {
  bookingNumber: string;
  customerName: string;
  originPort: string;
  destinationPort: string;
  vessel: string;
  shippingLine: string;
  sailingDate: Date;
  containerSize: string;
  containerQuantity: number;
  freightCost: number;
  carrierBookingNumber: string;
}

export const generateSailedReport = async (
  bookings: SailedBookingRow[],
  monthLabel: string,
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Freight Afford";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`Sailed Shipments - ${monthLabel}`);

  // ── Column definitions ──
  sheet.columns = [
    { header: "Booking #", key: "bookingNumber", width: 22 },
    { header: "Carrier Booking #", key: "carrierBookingNumber", width: 22 },
    { header: "Customer", key: "customerName", width: 26 },
    { header: "Origin Port", key: "originPort", width: 20 },
    { header: "Destination Port", key: "destinationPort", width: 20 },
    { header: "Vessel", key: "vessel", width: 24 },
    { header: "Shipping Line", key: "shippingLine", width: 18 },
    { header: "Sailing Date", key: "sailingDate", width: 18 },
    { header: "Container Size", key: "containerSize", width: 16 },
    { header: "Qty", key: "containerQuantity", width: 8 },
    { header: "Freight Cost (USD)", key: "freightCost", width: 22 },
  ];

  // ── Header row styling ──
  const headerRow = sheet.getRow(1);
  headerRow.height = 36;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    cell.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: 11,
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF334155" } },
    };
  });

  // ── Data rows ──
  bookings.forEach((booking, i) => {
    const row = sheet.addRow({
      bookingNumber: booking.bookingNumber,
      carrierBookingNumber: booking.carrierBookingNumber || "N/A",
      customerName: booking.customerName,
      originPort: booking.originPort.toUpperCase(),
      destinationPort: booking.destinationPort.toUpperCase(),
      vessel: booking.vessel || "N/A",
      shippingLine: booking.shippingLine || "N/A",
      sailingDate: booking.sailingDate.toDateString(),
      containerSize: booking.containerSize,
      containerQuantity: booking.containerQuantity,
      freightCost: booking.freightCost,
    });

    row.height = 24;

    // Zebra striping
    if (i % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      });
    }

    // Currency formatting for freight cost
    const costCell = row.getCell("freightCost");
    costCell.numFmt = '"$"#,##0.00';
    costCell.alignment = { horizontal: "right", vertical: "middle" };

    row.eachCell((cell) => {
      cell.alignment = { ...cell.alignment, vertical: "middle" };
    });
  });

  // ── Totals row ──
  const totalRow = sheet.addRow({
    bookingNumber: "TOTAL",
    freightCost: bookings.reduce((sum, b) => sum + b.freightCost, 0),
  });

  totalRow.height = 28;
  totalRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle" };
  });

  const totalCostCell = totalRow.getCell("freightCost");
  totalCostCell.numFmt = '"$"#,##0.00';
  totalCostCell.alignment = { horizontal: "right", vertical: "middle" };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};
