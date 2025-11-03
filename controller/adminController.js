import bcrypt from "bcrypt";
import admin from "../model/adminSchema.js";

const loadAdminLoginPage = async (req, res) => {
  try {
    if (req.session.admin) {
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
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please fill all fields" });
    }

    const existingUser = await admin.findOne({ email });
    if (!existingUser) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, existingUser.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    req.session.admin = true;
    req.session.adminId = existingUser._id;
    return res.json({ success: true, message: "Login successful" });

  } catch (error) {
    console.error("Login Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


const loadDashboardPage = async (req, res) => {
  if (req.session.admin) {
    try {
      const adminData = await admin.findById(req.session.adminId);
      const adminName = adminData ? adminData.email : "Admin";
      return res.render("admin/dashboard", { adminName });
    } catch (error) {
      console.log(error.message);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/admin/login");
  }
};

const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.log("Error destroying session:", err);
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
