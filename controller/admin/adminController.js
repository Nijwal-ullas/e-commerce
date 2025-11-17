import bcrypt from "bcrypt";
import admin from "../../model/adminSchema.js";

const loadAdminLoginPage = async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

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
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    if (req.session.adminId) {
      const adminData = await admin.findById(req.session.adminId);
      const adminName = adminData ? adminData.email : "Admin";
      return res.render("admin/dashboard", { adminName });
    } else {
      return res.redirect("/admin/login");
    }
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

      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      res.redirect("/admin/login");
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};

export default { loadAdminLoginPage, login, loadDashboardPage, logout };
