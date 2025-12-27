import bcrypt from "bcrypt";
import admin from "../../model/adminSchema.js";
import order from "../../model/orderSchema.js";
import product from "../../model/productSchema.js";
import user from "../../model/userSchema.js";
import coupon from "../../model/couponSchema.js";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { getDateRange } from "../../utilities/salesDate.js";

const loadAdminLoginPage = async (req, res) => {
  try {
    if (req.session.adminId) {
      return res.redirect("/admin/dashboard");
    }
    res.render("admin/loginPage", { message: null });
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (req.session.adminId) {
      return res.json({
        success: true,
        message: "Already logged in",
        redirect: "/admin/dashboard",
      });
    }

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please fill all fields",
      });
    }

    const existingUser = await admin.findOne({ email });
    if (!existingUser) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isMatch = await bcrypt.compare(password, existingUser.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    req.session.adminId = existingUser._id;
    req.session.admin = true;

    return res.json({
      success: true,
      message: "Login successful",
      redirect: "/admin/dashboard",
    });
  } catch (error) {
    console.error("Login Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const getTopSellingProducts = async () => {
  return await order.aggregate([
    { $match: { orderStatus: "Delivered", paymentStatus: "Paid" } },
    { $unwind: "$orderedItem" },
    {
      $group: {
        _id: "$orderedItem.productId",
        sold: { $sum: "$orderedItem.quantity" },
        totalRevenue: {
          $sum: {
            $multiply: ["$orderedItem.quantity", "$orderedItem.price"],
          },
        },
      },
    },
    { $sort: { sold: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    {
      $project: {
        _id: 0,
        productId: "$product._id",
        name: "$product.productName",
        sold: 1,
        totalRevenue: 1,
      },
    },
  ]);
};

const topSellingCategory = async () => {
  return await order.aggregate([
    {
      $match: { orderStatus: "Delivered", paymentStatus: "Paid" },
    },
    {
      $unwind: "$orderedItem",
    },
    {
      $lookup: {
        from: "products",
        localField: "orderedItem.productId",
        foreignField: "_id",
        as: "product",
      },
    },
    {
      $unwind: "$product",
    },
    {
      $group: {
        _id: "$product.category",
        sold: { $sum: "$orderedItem.quantity" },
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $unwind: "$category",
    },
    {
      $sort: { sold: -1 },
    },
    {
      $limit: 5,
    },
    {
      $project: {
        _id: 0,
        categoryId: "$category._id",
        categoryName: "$category.name",
        totalSold: "$sold",
      },
    },
  ]);
};

const loadDashboardPage = async (req, res) => {
  try {
    const adminId = req.session.adminId;
    if (!adminId) {
      return res.redirect("/admin/login");
    }

    const adminData = await admin.findById(adminId);
    const adminName = adminData ? adminData.email : "Admin";
    const topProducts = await getTopSellingProducts();
    const topCategory = await topSellingCategory();

    const orders = await order.find({
      paymentStatus: "Paid",
      orderStatus: { $nin: ["Cancelled", "Refunded"] },
    });

    let salesCount = orders.length;
    let totalSalesAmount = 0;
    let totalDiscount = 0;
    let couponDiscount = 0;

    orders.forEach((order) => {
      totalSalesAmount += order.finalAmount || 0;
      totalDiscount += order.discount || 0;
      couponDiscount += order.couponDiscount || 0;
    });

    const totalProducts = await product.countDocuments();
    const totalUsers = await user.countDocuments();
    const activeCoupons = await coupon.countDocuments({
      status: true,
      expireAt: { $gte: new Date() },
    });

    const recentOrders = await order
      .find()
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .limit(5)
      .select("orderId userId finalAmount orderStatus createdAt")
      .lean();

    const formattedRecentOrders = recentOrders.map((order) => ({
      orderId: order.orderId,
      userName: order.userId?.name || "Guest",
      totalAmount: order.finalAmount,
      status: order.orderStatus,
      createdAt: order.createdAt,
    }));

    return res.render("admin/dashboard", {
      adminName,
      salesCount,
      totalSalesAmount,
      totalDiscount,
      couponDiscount,
      totalProducts,
      totalUsers,
      activeCoupons,
      recentOrders: formattedRecentOrders,
      topProducts,
      topCategory,
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

const getOrderStatusReport = async (req, res) => {
  try {
    const statusData = await order.aggregate([
      {
        $group: {
          _id: "$orderStatus",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          status: "$_id",
          count: 1,
        },
      },
    ]);

    res.json({
      success: true,
      data: statusData,
    });
  } catch (error) {
    console.error("Order status report error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load order status report",
    });
  }
};

const getSalesReport = async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;

    const range = getDateRange(type, startDate, endDate);

    const report = await order.aggregate([
      {
        $match: {
          paymentStatus: "Paid",
          orderStatus: "Delivered",
          createdAt: {
            $gte: range.startDate,
            $lte: range.endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: range.groupFormat,
              date: "$createdAt",
            },
          },
          orderCount: { $sum: 1 },
          totalAmount: { $sum: "$totalPrice" },
          totalDiscount: { $sum: "$discount" },
          couponDiscount: { $sum: { $ifNull: ["$couponDiscount", 0] } },
          netSales: { $sum: "$finalAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const summary = report.reduce(
      (acc, cur) => {
        acc.salesCount += cur.orderCount;
        acc.totalSalesAmount += cur.netSales;
        acc.productDiscount += cur.totalDiscount;
        acc.couponDiscount += cur.couponDiscount;
        return acc;
      },
      {
        salesCount: 0,
        totalSalesAmount: 0,
        productDiscount: 0,
        couponDiscount: 0,
      }
    );

    res.json({
      success: true,
      data: report,
      summary,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

const getDateWiseOrderProductAggregation = async (range) => {
  return order.aggregate([
    {
      $match: {
        paymentStatus: "Paid",
        orderStatus: { $nin: ["Cancelled", "Refunded"] },
        createdAt: {
          $gte: range.startDate,
          $lte: range.endDate,
        },
      },
    },

    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $unwind: "$orderedItem",
    },

    {
      $group: {
        _id: {
          date: {
            $dateToString: {
              format: range.groupFormat, 
              date: "$createdAt",
            },
          },
          orderId: "$_id",
        },

        orderId: { $first: "$orderId" },
        customer: { $first: "$user.name" },
        payment: { $first: "$payment" },

        discount: { $first: { $ifNull: ["$discount", 0] } },
        couponDiscount: { $first: { $ifNull: ["$couponDiscount", 0] } },
        walletUsed: { $first: { $ifNull: ["$walletUsed", 0] } },
        finalAmount: { $first: "$finalAmount" },

        products: {
          $push: {
            productName: "$orderedItem.productName",
            ml: "$orderedItem.ml",
            quantity: "$orderedItem.quantity",

            oldPrice: "$orderedItem.oldPrice", 
            price: "$orderedItem.price",      
            originalTotal: {
              $multiply: [
                "$orderedItem.quantity",
                "$orderedItem.oldPrice",
              ],
            },

            sellingTotal: {
              $multiply: [
                "$orderedItem.quantity",
                "$orderedItem.price",
              ],
            },
          },
        },

        originalOrderTotal: {
          $sum: {
            $multiply: [
              "$orderedItem.quantity",
              "$orderedItem.oldPrice",
            ],
          },
        },

        orderTotal: {
          $sum: {
            $multiply: [
              "$orderedItem.quantity",
              "$orderedItem.price",
            ],
          },
        },
      },
    },

    {
      $addFields: {
        productDiscount: {
          $subtract: ["$originalOrderTotal", "$orderTotal"],
        },
        totalSavings: {
          $subtract: ["$originalOrderTotal", "$finalAmount"],
        },
      },
    },

    {
      $group: {
        _id: "$_id.date",

        orders: {
          $push: {
            orderId: "$orderId",
            customer: "$customer",
            payment: "$payment",
            products: "$products",

            originalOrderTotal: "$originalOrderTotal",
            orderTotal: "$orderTotal",

            productDiscount: "$productDiscount",
            couponDiscount: "$couponDiscount",
            walletUsed: "$walletUsed",
            finalAmount: "$finalAmount",
            totalSavings: "$totalSavings",
          },
        },

        totalOrders: { $sum: 1 },

        dateOriginalTotal: { $sum: "$originalOrderTotal" },
        dateSellingTotal: { $sum: "$orderTotal" },
        dateNetSales: { $sum: "$finalAmount" },
        dateTotalSavings: { $sum: "$totalSavings" },
      },
    },

    {
      $sort: { _id: -1 },
    },
  ]);
};



const downloadExcel = async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    const range = getDateRange(type, startDate, endDate);

    const data = await getDateWiseOrderProductAggregation(range);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Date Order Product Report");

    sheet.columns = [
      { header: "Date", width: 15 },
      { header: "Customer Name", width: 25 },
      { header: "Order ID", width: 30 },
      { header: "Product Name", width: 35 },
      { header: "Payment", width: 15},
      { header: "Variant (ml)", width: 15 },
      { header: "Quantity", width: 12 },
      { header: "Price", width: 15 },
      { header: "Total", width: 15 },
    ];

    data.forEach((day) => {

      day.orders.forEach((order) => {

        order.products.forEach((p, index) => {
          sheet.addRow([
            index === 0 ? day._id : "",
            order.customer,
            order.orderId,
            p.productName,
            order.payment,
            p.ml || "-",
            p.quantity,
            p.oldPrice,          
            p.originalTotal,     
          ]);
        });

        sheet.addRow([
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "Items Total:",
          order.originalOrderTotal,
        ]);

        if (order.productDiscount > 0) {
          sheet.addRow([
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "Product Discount:",
            -order.productDiscount,
          ]);
        }

        if (order.couponDiscount > 0) {
          sheet.addRow([
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "Coupon Discount:",
            -order.couponDiscount,
          ]);
        }

        sheet.addRow([
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "Final Amount:",
          order.finalAmount,
        ]);

        sheet.addRow([]);
      });

      sheet.addRow([
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "Total Orders:",
        day.totalOrders,
      ]);

    
      sheet.addRow([
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "Date Net Sales:",
        day.dateNetSales,
      ]);

      sheet.addRow([]);
    });
    

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=date-order-product-report.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).send("Excel download failed");
  }
};


const downloadPdf = async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    const range = getDateRange(type, startDate, endDate);

    const data = await getDateWiseOrderProductAggregation(range);

    const doc = new PDFDocument({ margin: 40, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=date-order-product-report.pdf"
    );

    doc.pipe(res);

    const PAGE_BOTTOM = 700;
    const START_X = 40;
    const START_Y = 40;
    const ROW_HEIGHT = 35;

    const headers = [
      "Customer",
      "Order ID",
      "Product",
      "ML",
      "Payment",
      "Qty",
      "Price",
      "Total",
    ];

    const columnWidths = [80, 100, 80, 30, 70, 30, 80, 80];

    const drawHeader = (y) => {
      let x = START_X;
      headers.forEach((header, i) => {
        doc.rect(x, y, columnWidths[i], ROW_HEIGHT).fill("#1f2937");
        doc
          .fillColor("white")
          .fontSize(11)
          .text(header, x + 5, y + 10, {
            width: columnWidths[i] - 10,
            align: i >= 5 ? "center" : "left",
          });
        x += columnWidths[i];
      });
      return y + ROW_HEIGHT;
    };

    const drawRow = (row, y, shaded = false) => {
      let x = START_X;
      row.forEach((cell, i) => {
        doc
          .rect(x, y, columnWidths[i], ROW_HEIGHT)
          .fill(shaded ? "#f9fafb" : "white");

        doc
          .fillColor("black")
          .fontSize(10)
          .text(String(cell || ""), x + 5, y + 10, {
            width: columnWidths[i] - 10,
            align: i >= 5 ? "center" : "left",
          });

        x += columnWidths[i];
      });
      return y + ROW_HEIGHT;
    };

    doc.fontSize(18).text("Date-wise Order & Product Report", {
      align: "center",
    });
    doc.moveDown(2);

    let y = doc.y;

    data.forEach((day) => {
      if (y + 40 > PAGE_BOTTOM) {
        doc.addPage();
        y = START_Y;
      }

      doc
        .fontSize(14)
        .fillColor("#1f2937")
        .text(`Date: ${day._id}`, START_X, y, { underline: true });

      y += 30;

      y = drawHeader(y);

      day.orders.forEach((order) => {
        const orderRows = [];

        order.products.forEach((p, index) => {
          orderRows.push([
            order.customer,
            index === 0
              ? String(order.orderId)
              : "",
            p.productName,
            p.ml || "-",
            index === 0 ? order.payment : "",
            p.quantity,
            p.oldPrice,
            p.originalTotal,
          ]);
        });

        orderRows.push(["", "", "", "", "", "", "Items Total:", order.originalOrderTotal]);

        if (order.productDiscount > 0) {
          orderRows.push(["", "", "", "", "", "", "Product Discount:", `- ${order.productDiscount}`]);
        }

        if (order.couponDiscount > 0) {
          orderRows.push(["", "", "", "", "", "", "Coupon Discount:", `- ${order.couponDiscount}`]);
        }

        orderRows.push(["", "", "", "", "", "", "Final Amount:", order.finalAmount]);
        orderRows.push(["", "", "", "", "", "", "", ""]);

        const requiredHeight = orderRows.length * ROW_HEIGHT;

        if (y + requiredHeight > PAGE_BOTTOM) {
          doc.addPage();
          y = START_Y;
          y = drawHeader(y);
        }

        orderRows.forEach((row, idx) => {
          y = drawRow(row, y, idx % 2 === 0);
        });
      });

      if (y + 60 > PAGE_BOTTOM) {
        doc.addPage();
        y = START_Y;
      }

      y += 10;
      y = drawRow(["", "", "", "", "", "", "Total Orders:", day.totalOrders], y);
      y = drawRow(["", "", "", "", "", "", "Date Net Sales:", `Rs.${day.dateNetSales}`], y);

      y += 20;
      doc.moveTo(START_X, y).lineTo(555, y).stroke("#e5e7eb");
      y += 20;
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("PDF download failed");
  }
};

const logout = async (req, res) => {
  try {
    res.clearCookie("admin-session");

    req.session.adminId = null;
    req.session.admin = null;

    req.session.save((err) => {
      if (err) {
        console.log("Error saving session:", err);
        return res.status(500).send("Internal Server Error");
      }
      res.redirect("/admin/login");
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

export default {
  loadAdminLoginPage,
  login,
  loadDashboardPage,
  getOrderStatusReport,
  getSalesReport,
  downloadExcel,
  downloadPdf,
  logout,
};
