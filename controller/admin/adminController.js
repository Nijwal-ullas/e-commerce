import bcrypt from "bcrypt";
import admin from "../../model/adminSchema.js";
import order from "../../model/orderSchema.js";
import product from "../../model/productSchema.js";
import user from "../../model/userSchema.js";
import coupon from "../../model/couponSchema.js";

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

const loadDashboardPage = async (req, res) => {
  try {
    const adminId = req.session.adminId;
    if (!adminId) {
      return res.redirect("/admin/login");
    }

    const adminData = await admin.findById(adminId);
    const adminName = adminData ? adminData.email : "Admin";

    const orders = await order.find({
      paymentStatus: "Paid",
      orderStatus : {$nin:["Cancelled","Pending","Shipped","Processing"]} 
    });

    let salesCount = orders.length;
    let totalSalesAmount = 0;
    let totalDiscount = 0;
    let couponDiscount = 0;

    orders.forEach(order => {
      totalSalesAmount += order.finalAmount || 0;
      totalDiscount += order.discount || 0;
      couponDiscount += order.couponDiscount || 0;
    });

    const totalProducts = await product.countDocuments();
    const totalUsers = await user.countDocuments();
    const activeCoupons = await coupon.countDocuments({ 
      status: true,
      expireAt: { $gte: new Date() }
    });

    const recentOrders = await order.find()
      .populate('userId', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderId userId finalAmount orderStatus createdAt')
      .lean();

    const formattedRecentOrders = recentOrders.map(order => ({
      orderId: order.orderId,
      userName: order.userId?.name || 'Guest',
      totalAmount: order.finalAmount,
      status: order.orderStatus,
      createdAt: order.createdAt
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
    });

  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
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

export default { loadAdminLoginPage, login, loadDashboardPage, logout };
